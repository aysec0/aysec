/* Levels system — single source of truth for tier metadata.
 * Used by the dashboard endpoint, /api/levels, profile, leaderboard.
 *
 * XP is multi-source:
 *   - CTF challenge points (1 XP per point)
 *   - Lesson completion: +10 XP each
 *   - Certificate earned:  +50 XP each
 *   - First blood:         +25 XP each (on top of CTF points)
 */
import { Router } from 'express';

export const LEVELS = [
  { idx: 0,  min: 0,     name: 'n00b',          color: '#8b95a5', icon: 'egg',       tagline: 'Welcome aboard. Everyone starts here.' },
  { idx: 1,  min: 50,    name: 'Script Kiddie', color: '#a3a8b5', icon: 'keyboard',  tagline: 'Your first few flags. The rabbit hole opens.' },
  { idx: 2,  min: 150,   name: 'Recon',         color: '#4d9aff', icon: 'eye',       tagline: 'You see things others miss.' },
  { idx: 3,  min: 350,   name: 'Lockpicker',    color: '#5dbcff', icon: 'lock',      tagline: 'Doors no longer say no.' },
  { idx: 4,  min: 700,   name: 'Pentester',     color: '#3fb950', icon: 'shield',    tagline: 'Real engagements territory.' },
  { idx: 5,  min: 1200,  name: 'Bug Hunter',    color: '#7ed957', icon: 'bug',       tagline: 'You see the seams in everything you touch.' },
  { idx: 6,  min: 2000,  name: 'Operator',      color: '#d29922', icon: 'gear',      tagline: 'Multi-host. Multi-domain. Multi-day.' },
  { idx: 7,  min: 3500,  name: 'Specialist',    color: '#ff9544', icon: 'target',    tagline: 'Top-1% in at least one category.' },
  { idx: 8,  min: 5500,  name: 'Red Teamer',    color: '#f25555', icon: 'crosshair', tagline: 'You break and reset everything before lunch.' },
  { idx: 9,  min: 8500,  name: 'Cipherpunk',    color: '#db61a2', icon: 'key',       tagline: 'Hardware, crypto, kernel — all on the table.' },
  { idx: 10, min: 12500, name: 'Veteran',       color: '#a47bff', icon: 'medal',     tagline: "You've been here. You'll be back. They know you." },
  { idx: 11, min: 18000, name: 'Expert',        color: '#7b5dff', icon: 'star',      tagline: 'Three-letter agencies have your CV starred.' },
  { idx: 12, min: 26000, name: 'Master',        color: '#ffd770', icon: 'crown',     tagline: 'You author the writeups others read.' },
  { idx: 13, min: 38000, name: 'Grandmaster',   color: '#ffb84d', icon: 'gem',       tagline: 'You set the curve for everyone else.' },
  { idx: 14, min: 60000, name: 'Legend',        color: 'rainbow', icon: 'sparkle',   tagline: 'Your handle is now a verb.' },
];

export function levelFor(xp) {
  let lvlIdx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].min) { lvlIdx = i; break; }
  }
  const cur  = LEVELS[lvlIdx];
  const next = LEVELS[lvlIdx + 1] || null;
  const xpPct = next ? Math.min(100, Math.round(((xp - cur.min) / (next.min - cur.min)) * 100)) : 100;
  return {
    current: cur,
    next,
    xp,
    xp_pct: xpPct,
    level_idx: lvlIdx,
    total_levels: LEVELS.length,
  };
}

/** Compute XP from underlying counters. Single source of truth. */
export function computeXP({ ctf_points, lessons_done, certificates, first_bloods }) {
  const ctf  = Number(ctf_points) || 0;
  const less = (Number(lessons_done) || 0) * 10;
  const cert = (Number(certificates) || 0) * 50;
  const fb   = (Number(first_bloods)  || 0) * 25;
  return {
    ctf, lessons: less, certs: cert, first_bloods: fb,
    total: ctf + less + cert + fb,
  };
}

/* Public router exposing the ladder so the /levels page can render it. */
const router = Router();
router.get('/', (_req, res) => {
  res.json({
    levels: LEVELS,
    xp_rules: {
      ctf:          '1 XP per CTF challenge point',
      lessons:      '+10 XP per lesson completed',
      certificates: '+50 XP per course completion certificate',
      first_bloods: '+25 XP per first-blood (on top of CTF points)',
    },
  });
});

export default router;
