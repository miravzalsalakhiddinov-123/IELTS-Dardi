const tg = require('../lib/telegram');

// Visit: https://<your-vercel-app>.vercel.app/api/set-webhook?secret=YOUR_SETUP_SECRET
// This tells Telegram to send all updates to /api/webhook on this same deployment.
module.exports = async (req, res) => {
  const { secret } = req.query;

  if (process.env.SETUP_SECRET && secret !== process.env.SETUP_SECRET) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const webhookUrl = `https://${host}/api/webhook`;

  const result = await tg.setWebhook(webhookUrl, process.env.WEBHOOK_SECRET);
  res.status(200).json({ webhookUrl, result });
};
