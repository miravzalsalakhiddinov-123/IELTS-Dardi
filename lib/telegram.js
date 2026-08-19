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

module.exports = {
  escapeHtml,
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
