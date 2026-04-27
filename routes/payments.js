import { Router } from 'express';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

router.post('/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured (set STRIPE_SECRET_KEY).' });

  const { courseSlug } = req.body || {};
  const course = db.prepare(
    'SELECT id, title, price_cents, currency, stripe_price_id FROM courses WHERE slug = ? AND is_paid = 1 AND published = 1'
  ).get(courseSlug);
  if (!course) return res.status(404).json({ error: 'Paid course not found' });

  const already = db.prepare(
    'SELECT 1 FROM course_access WHERE user_id = ? AND course_id = ?'
  ).get(req.user.id, course.id);
  if (already) return res.status(409).json({ error: 'Already enrolled' });

  const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: req.user.email,
    line_items: [
      course.stripe_price_id
        ? { price: course.stripe_price_id, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: (course.currency || 'USD').toLowerCase(),
              unit_amount: course.price_cents,
              product_data: { name: course.title },
            },
          },
    ],
    metadata: {
      user_id: String(req.user.id),
      course_id: String(course.id),
    },
    success_url: `${siteUrl}/courses/${courseSlug}?purchased=1`,
    cancel_url:  `${siteUrl}/courses/${courseSlug}?canceled=1`,
  });

  res.json({ url: session.url });
});

// Mounted in server.js BEFORE express.json() because Stripe needs the raw body.
export async function stripeWebhook(req, res) {
  if (!stripe) return res.status(503).end();
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = secret
      ? stripe.webhooks.constructEvent(req.body, sig, secret)
      : JSON.parse(req.body.toString()); // dev fallback only
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = Number(session.metadata?.user_id);
    const courseId = Number(session.metadata?.course_id);
    if (userId && courseId) {
      db.prepare(`
        INSERT OR IGNORE INTO course_access (user_id, course_id, source, stripe_session_id)
        VALUES (?, ?, 'stripe', ?)
      `).run(userId, courseId, session.id);
    }
  }

  res.json({ received: true });
}

export default router;
