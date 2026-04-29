/* Login-streak rewards. Frontend POSTs /api/streaks/checkin once per
 * visit; we award XP based on consecutive UTC-day visits and emit a
 * notification on milestones.
 */
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { emit as emitNotification } from './notifications.js';

const router = Router();

// Daily XP grant based on streak length. Bonuses on milestones.
function dailyXp(streak) {
  if (streak >= 30) return 20;
  if (streak >= 14) return 15;
  if (streak >= 7)  return 10;
  return 5;
}
const MILESTONES = { 3: 25, 7: 50, 14: 100, 30: 200, 100: 500 };

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayOf(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

router.post('/checkin', requireAuth, (req, res) => {
  const today = todayUtc();
  const row = db.prepare(
    'SELECT current_days, longest_days, last_login_date, total_xp FROM login_streaks WHERE user_id = ?'
  ).get(req.user.id);

  // Already checked in today — return current state, no double-grant
  if (row?.last_login_date === today) {
    return res.json({
      checked_in_today: true,
      current: row.current_days,
      longest: row.longest_days,
      total_xp: row.total_xp,
      awarded_xp: 0,
    });
  }

  // Determine new streak
  let newStreak;
  if (!row) {
    newStreak = 1;
  } else if (yesterdayOf(row.last_login_date) === today) {
    newStreak = row.current_days + 1;
  } else {
    newStreak = 1; // gap → reset
  }

  // XP for today + milestone bonus
  let award = dailyXp(newStreak);
  if (MILESTONES[newStreak]) award += MILESTONES[newStreak];

  const longest = Math.max(newStreak, row?.longest_days || 0);
  const totalXp = (row?.total_xp || 0) + award;

  db.prepare(`
    INSERT INTO login_streaks (user_id, current_days, longest_days, last_login_date, total_xp)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      current_days     = excluded.current_days,
      longest_days     = excluded.longest_days,
      last_login_date  = excluded.last_login_date,
      total_xp         = excluded.total_xp
  `).run(req.user.id, newStreak, longest, today, totalXp);

  // Notify on milestones
  if (MILESTONES[newStreak]) {
    emitNotification({
      userId: req.user.id,
      kind: 'streak',
      title: `🔥 ${newStreak}-day login streak`,
      body: `+${award} XP — ${newStreak === 100 ? 'legendary' : 'keep showing up'}`,
      link: '/dashboard',
      icon: '🔥',
    });
  }

  res.json({
    checked_in_today: false,
    current: newStreak,
    longest,
    total_xp: totalXp,
    awarded_xp: award,
    is_milestone: !!MILESTONES[newStreak],
  });
});

// Read-only — used by the dashboard widget to render streak status
router.get('/', optionalAuth, (req, res) => {
  if (!req.user) return res.json({ current: 0, longest: 0, total_xp: 0 });
  const row = db.prepare(
    'SELECT current_days, longest_days, last_login_date, total_xp FROM login_streaks WHERE user_id = ?'
  ).get(req.user.id) || { current_days: 0, longest_days: 0, total_xp: 0 };
  // If today wasn't already checked in and the gap > 1 day, the streak is
  // at risk — show the "current" we'd reset to (1 if checking in now)
  res.json({
    current: row.current_days,
    longest: row.longest_days,
    total_xp: row.total_xp,
    last_login_date: row.last_login_date,
    today: todayUtc(),
  });
});

export default router;
