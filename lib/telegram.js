const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

async function call(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error [${method}]:`, JSON.stringify(data));
  }
  return data;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Formatting entities we know how to render as HTML. Telegram sends these
// when the admin uses their own formatting toolbar / emoji keyboard while
// typing a reply to the bot — bold, italic, spoiler, links, and (if their
// Telegram account has access) Premium custom/animated emoji.
const TAG_FOR = {
  bold: 'b',
  italic: 'i',
  underline: 'u',
  strikethrough: 's',
  spoiler: 'tg-spoiler',
  code: 'code',
};

function openTag(e) {
  if (e.type === 'text_link') return `<a href="${escapeHtml(e.url)}">`;
  if (e.type === 'custom_emoji') return `<tg-emoji emoji-id="${escapeHtml(e.custom_emoji_id)}">`;
  if (e.type === 'pre') return e.language ? `<pre><code class="language-${escapeHtml(e.language)}">` : '<pre>';
  const tag = TAG_FOR[e.type];
  return tag ? `<${tag}>` : '';
}

function closeTag(e) {
  if (e.type === 'text_link') return '</a>';
  if (e.type === 'custom_emoji') return '</tg-emoji>';
  if (e.type === 'pre') return e.language ? '</code></pre>' : '</pre>';
  const tag = TAG_FOR[e.type];
  return tag ? `</${tag}>` : '';
}

// Converts a plain-text message + its Telegram formatting entities into the
// equivalent HTML, so a reply typed with Telegram's own bold/italic/spoiler
// toolbar and emoji keyboard (Premium emoji included) comes out formatted
// exactly the same way when we re-send it. Offsets are UTF-16 code units,
// which is how JS already indexes strings, so no surrogate-pair math needed.
function entitiesToHtml(text = '', entities = []) {
  const supported = entities.filter((e) => e.type in TAG_FOR || e.type === 'text_link' || e.type === 'custom_emoji' || e.type === 'pre');
  if (!supported.length) return escapeHtml(text);

  let out = '';
  const stack = [];
  for (let i = 0; i <= text.length; i++) {
    while (stack.length && stack[stack.length - 1].offset + stack[stack.length - 1].length === i) {
      out += closeTag(stack.pop());
    }
    const startingHere = supported
      .filter((e) => e.offset === i)
      .sort((a, b) => b.length - a.length); // longer (outer) entities open first
    for (const e of startingHere) {
      stack.push(e);
      out += openTag(e);
    }
    if (i < text.length) out += escapeHtml(text[i]);
  }
  return out;
}

// Custom/Premium emoji can only be *sent* by bots that own a Fragment
// collectible username — an ordinary bot's sendMessage call fails if the
// text contains a <tg-emoji> tag. This strips those tags down to their
// plain fallback glyph so the message can still go out normally.
function stripCustomEmoji(html = '') {
  return html.replace(/<tg-emoji emoji-id="[^"]*">(.*?)<\/tg-emoji>/gs, '$1');
}

module.exports = {
  escapeHtml,
  entitiesToHtml,
  stripCustomEmoji,
  sendMessage:   (chat_id, text, extra = {}) => call('sendMessage',   { chat_id, text, parse_mode: 'HTML', ...extra }),
  sendPhoto:     (chat_id, photo, extra = {}) => call('sendPhoto',    { chat_id, photo, parse_mode: 'HTML', ...extra }),
  sendDocument:  (chat_id, document, extra = {}) => call('sendDocument', { chat_id, document, parse_mode: 'HTML', ...extra }),
  sendVoice:     (chat_id, voice, extra = {}) => call('sendVoice',    { chat_id, voice, parse_mode: 'HTML', ...extra }),
  copyMessage:   (chat_id, from_chat_id, message_id, extra = {}) => call('copyMessage', { chat_id, from_chat_id, message_id, ...extra }),
  deleteMessage: (chat_id, message_id) => call('deleteMessage', { chat_id, message_id }),
  editMessageText: (chat_id, message_id, text, extra = {}) => call('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', ...extra }),
  editMessageReplyMarkup: (chat_id, message_id, reply_markup = {}) => call('editMessageReplyMarkup', { chat_id, message_id, reply_markup }),
  answerCallbackQuery: (callback_query_id, extra = {}) => call('answerCallbackQuery', { callback_query_id, ...extra }),
  setWebhook: (url, secret_token) => call('setWebhook', { url, secret_token, allowed_updates: ['message', 'callback_query'] }),
  deleteWebhook: () => call('deleteWebhook', {}),
  getWebhookInfo: () => call('getWebhookInfo', {}),
};
