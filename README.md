# IELTS Dardi — Telegram Bot

Category-first Q&A bot. Students pick a category, then send anything (text,
photo/screenshot, PDF, voice) as one submission. Admin reviews every
submission as the same "card" — Publish / Edit / Reject — regardless of what
was attached. Publishing posts it to your channel.

Stack: **Vercel** (serverless functions, no server to manage) + **Supabase**
(Postgres for questions & session state) + raw Telegram Bot API via `fetch`
(no bot framework needed for a webhook-only bot this size).

## 1. Create the Supabase project

1. Go to supabase.com → New project.
2. Open the SQL Editor → paste the contents of `sql/schema.sql` → Run.
3. Go to Project Settings → API. Copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`
     (server-side only — never expose this in client code; here it's fine
     because it's only used inside Vercel serverless functions.)

## 2. Create the Telegram bot

1. Talk to **@BotFather** → `/newbot` → get your `TELEGRAM_BOT_TOKEN`.
2. Create your public channel (or reuse one), then add the bot as an
   **admin** of that channel (needs "Post messages" permission).
3. Get the channel's `CHANNEL_ID`:
   - If it's a public channel, you can just use `@your_channel_username`.
   - If private, forward any message from it to **@userinfobot** or use
     `getUpdates` to read the numeric `-100...` id.
4. Get your own numeric Telegram ID (for `ADMIN_CHAT_ID`) from
   **@userinfobot**. Message your bot at least once from this account so
   Telegram has a chat with you to send review cards to.

## 3. Deploy to Vercel

```bash
npm install -g vercel   # if you don't have it
cd ielts-dardi-bot
vercel                  # first deploy, follow prompts
```

In the Vercel dashboard → your project → **Settings → Environment
Variables**, add everything from `.env.example` with your real values:

- `TELEGRAM_BOT_TOKEN`
- `ADMIN_CHAT_ID`
- `CHANNEL_ID`
- `WEBHOOK_SECRET` (any random string you make up)
- `SETUP_SECRET` (any random string you make up)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Redeploy so the new env vars take effect:

```bash
vercel --prod
```

## 4. Point Telegram at your bot

Visit, in a browser:

```
https://<your-vercel-app>.vercel.app/api/set-webhook?secret=YOUR_SETUP_SECRET
```

You should see `{"ok": true, ...}` in the response. That's it — the bot is
live. Message it `/start`.

## How it works

- `/start` → shows the 7 category buttons (`lib/categories.js` is the only
  place you edit to add/remove/rename categories).
- Tapping a category stores `{state: 'awaiting_question', category}` in
  `user_sessions` (Postgres, since serverless functions have no memory
  between requests) and prompts for the actual question.
- Whatever the student sends next (text / photo / document / voice) is
  saved as one row in `questions`, and copied to your admin chat, followed
  by a **👁 Preview** message showing the *exact* text that will be posted
  to the channel (hashtag, emoji, formatting — all of it), then the
  **Publish / Edit / Reject** review card.
- Hashtags are always lowercase (`#reading`, not `#Reading`) — set once in
  `lib/categories.js`, no per-post typing needed.
- **Publish** posts the previewed text to `CHANNEL_ID` as-is, attachment
  included if there was one. Every post ends with a "📩 Send your questions
  here" line linking back to the bot (`BOT_LINK` at the top of
  `api/webhook.js` — update it if the bot's @username ever changes) — this
  is added automatically, so Edit only needs to touch the question text.
- **Edit** shows you the current post text (as a copyable code block) and
  asks you to send the full replacement — reword it, add your own emojis,
  whatever you like. Whatever you send becomes the exact post text, and a
  fresh preview + review card comes back so you can check it before
  publishing.
- **Reject** just marks the row `rejected` — nothing is posted.

## Extending it

- Add categories: edit the `CATEGORIES` object in `lib/categories.js` only.
- Add a stats command (`/stats` for admin): query `questions` grouped by
  `status`/`category` — the table already has everything needed.
- Rate-limit spam: check `count(*) where user_id = ... and created_at >
  now() - interval '1 hour'` before inserting.
