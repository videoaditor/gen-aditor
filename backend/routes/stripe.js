const express = require('express');
const router = express.Router();

// Stripe init (lazy - only when keys are configured)
let stripe = null;
function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

const PLANS = {
  starter: {
    name: 'Starter',
    priceId: process.env.STRIPE_PRICE_STARTER || 'price_1SxKkxI5Tj951ISsswWjuwfn',
    amount: 2900,
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRICE_PRO || 'price_1SxKkyI5Tj951ISs5hj7dVml',
    amount: 7900,
  },
  business: {
    name: 'Business',
    priceId: process.env.STRIPE_PRICE_BUSINESS || 'price_1SxKkyI5Tj951ISse6LaaQeG',
    amount: 19900,
  },
  beta: {
    name: 'Beta (Early Access)',
    priceId: process.env.STRIPE_PRICE_BETA || 'price_1SxKkzI5Tj951ISshd5io58E',
    amount: 4900,
  },
};

// Create checkout session
router.post('/create-checkout-session', async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Stripe not configured' });

  try {
    const { plan, email, userId } = req.body;
    const planConfig = PLANS[plan];
    if (!planConfig) {
      return res.status(400).json({ error: `Invalid plan: ${plan}. Options: ${Object.keys(PLANS).join(', ')}` });
    }

    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL || 'https://gen.aditor.ai'}/dashboard.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://gen.aditor.ai'}/signup.html?cancelled=true`,
      metadata: { plan, userId: userId || '' },
    };

    // Pre-fill email if provided
    if (email) sessionParams.customer_email = email;

    // Add trial for starter plan
    if (plan === 'starter' || plan === 'beta') {
      sessionParams.subscription_data = { trial_period_days: 7 };
    }

    const session = await s.checkout.sessions.create(sessionParams);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).send('Stripe not configured');

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret) {
      event = s.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('[Stripe] Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = req.app.locals.db;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const email = session.customer_email || session.customer_details?.email;
        const customerName = session.customer_details?.name || email?.split('@')[0] || 'client';
        const plan = session.metadata?.plan || 'starter';

        console.log(`[Stripe] ✅ Checkout completed: ${email} → ${plan}`);

        // Update user in database
        if (email && db) {
          db.run(
            `UPDATE users SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = datetime('now') WHERE email = ?`,
            [plan, customerId, subscriptionId, email]
          );
        }

        // Create Slack channel for 90 Day Buildout customers
        const productId = session.line_items?.data?.[0]?.price?.product;
        const isBuildout = productId === 'prod_TzmTo6iWW65MOI' || 
                           session.subscription_data?.metadata?.max_payments === '2' ||
                           session.amount_total >= 240000; // €2400+
        
        if (isBuildout && email) {
          try {
            const SLACK_TOKEN = process.env.SLACK_USER_TOKEN;
            const ALAN_SLACK_ID = 'U04NRHWBSMT';
            
            if (SLACK_TOKEN) {
              // Create channel name from customer name
              const channelName = `buildout-${customerName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}-${Date.now().toString().slice(-4)}`;
              
              // Create private channel
              const createRes = await fetch('https://slack.com/api/conversations.create', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${SLACK_TOKEN}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: channelName, is_private: true })
              });
              const createData = await createRes.json();
              
              if (createData.ok && createData.channel?.id) {
                const channelId = createData.channel.id;
                console.log(`[Stripe] 📢 Created Slack channel: #${channelName} (${channelId})`);
                
                // Invite Alan
                await fetch('https://slack.com/api/conversations.invite', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${SLACK_TOKEN}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ channel: channelId, users: ALAN_SLACK_ID })
                });
                
                // Post welcome message
                await fetch('https://slack.com/api/chat.postMessage', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${SLACK_TOKEN}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    channel: channelId,
                    text: `🎉 *New Buildout Client: ${customerName}*\n\nEmail: ${email}\nPlan: 90 Day Creative Inhouse Buildout\n\n_Invite the client to this channel via Slack Connect or email them the channel link._`
                  })
                });
                
                console.log(`[Stripe] ✅ Slack channel ready, Alan invited`);
              }
            }
          } catch (slackErr) {
            console.error('[Stripe] Slack channel creation error:', slackErr.message);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const status = subscription.status;
        const customerId = subscription.customer;

        console.log(`[Stripe] Subscription updated: ${customerId} → ${status}`);

        if (db) {
          if (status === 'active' || status === 'trialing') {
            // Subscription is good
          } else if (status === 'past_due' || status === 'unpaid') {
            // Downgrade to free
            db.run(
              `UPDATE users SET plan = 'free' WHERE stripe_customer_id = ?`,
              [customerId]
            );
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        console.log(`[Stripe] ❌ Subscription cancelled: ${customerId}`);

        if (db) {
          db.run(
            `UPDATE users SET plan = 'free', stripe_subscription_id = NULL WHERE stripe_customer_id = ?`,
            [customerId]
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log(`[Stripe] ⚠️ Payment failed: ${invoice.customer_email}`);
        break;
      }

      case 'invoice.paid': {
        // Handle installment plan auto-cancellation
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        
        if (subscriptionId) {
          try {
            const subscription = await s.subscriptions.retrieve(subscriptionId);
            const maxPayments = subscription.metadata?.max_payments;
            
            if (maxPayments) {
              // Count paid invoices for this subscription
              const invoices = await s.invoices.list({
                subscription: subscriptionId,
                status: 'paid',
                limit: 10
              });
              
              const paidCount = invoices.data.length;
              console.log(`[Stripe] 💳 Installment payment ${paidCount}/${maxPayments} for ${subscriptionId}`);
              
              if (paidCount >= parseInt(maxPayments)) {
                console.log(`[Stripe] ✅ Auto-canceling subscription ${subscriptionId} - completed ${maxPayments} payments`);
                await s.subscriptions.cancel(subscriptionId);
              }
            }
          } catch (err) {
            console.error(`[Stripe] Error handling installment:`, err.message);
          }
        }
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Stripe] Webhook processing error:`, err);
  }

  res.json({ received: true });
});

// Customer portal (manage subscription)
router.post('/portal', async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Stripe not configured' });

  try {
    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ error: 'customerId required' });

    const session = await s.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL || 'https://gen.aditor.ai'}/dashboard.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Portal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Check subscription status
router.get('/status/:customerId', async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Stripe not configured' });

  try {
    const subscriptions = await s.subscriptions.list({
      customer: req.params.customerId,
      status: 'all',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return res.json({ active: false, plan: 'free' });
    }

    const sub = subscriptions.data[0];
    res.json({
      active: sub.status === 'active' || sub.status === 'trialing',
      status: sub.status,
      plan: sub.metadata?.plan || 'unknown',
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available plans
router.get('/plans', (req, res) => {
  const plans = Object.entries(PLANS).map(([key, val]) => ({
    id: key,
    name: val.name,
    amount: val.amount,
    currency: 'usd',
    interval: 'month',
  }));
  res.json(plans);
});

module.exports = router;
