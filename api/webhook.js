const tg = require('../lib/telegram');
const supabase = require('../lib/supabase');
const { CATEGORIES, categoryKeyboard, label, tag } = require('../lib/categories');

const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const REVIEW_KEYBOARD = (id) => ({
  inline_keyboard: [[
    { text: '✅ Publish', callback_data: `pub:${id}` },
    { text: '✏️ Edit', callback_data: `edit:${id}` },
    { text: '❌ Reject', callback_data: `rej:${id}` },
  ]],
});

module.exports = async (req, res) => {
  // Only Telegram should be able to reach this. If you set WEBHOOK_SECRET when
  // calling setWebhook, Telegram echoes it back on every request.
  if (WEBHOOK_SECRET) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== WEBHOOK_SECRET) {
      res.status(401).end('unauthorized');
      return;
    }
  }

  if (req.method !== 'POST') {
    res.status(200).end('ok');
    return;
  }

  const update = req.body;

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error('webhook error:', err);
  }

  // Always 200 quickly — Telegram retries aggressively on non-2xx / timeouts.
  res.status(200).end('ok');
};

// ---------------------------------------------------------------------------
// Messages (text, photo, document, voice, /start)
// ---------------------------------------------------------------------------

async function handleMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || '';

  if (text.trim() === '/start' || text.trim() === '/ask') {
    await supabase.from('user_sessions').delete().eq('user_id', userId);
    await sendCategoryPicker(chatId);
    return;
  }

  // Admin editing the text of an existing submission
  if (chatId === ADMIN_CHAT_ID) {
    const { data: session } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (session?.state === 'awaiting_edit' && session.question_id) {
      await handleAdminEditSubmit(session.question_id, text, chatId);
      await supabase.from('user_sessions').delete().eq('user_id', userId);
      return;
    }
  }

  // Student submitting a question (text / photo / document / voice)
  const { data: session } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (session?.state === 'awaiting_question' && session.category) {
    // Clean up the "please send your question" prompt now that they've answered it.
    if (session.prompt_message_id) {
      await tg.deleteMessage(chatId, session.prompt_message_id);
    }
    await handleSubmission(message, session.category);
    await supabase.from('user_sessions').delete().eq('user_id', userId);
    return;
  }

  // No active session — nudge them to /start instead of silently dropping the message.
  await tg.sendMessage(chatId, "Please choose a category first — send /start to begin.");
}

async function handleSubmission(message, category) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  let attachmentType = null;
  let fileId = null;

  if (message.photo && message.photo.length) {
    attachmentType = 'photo';
    fileId = message.photo[message.photo.length - 1].file_id; // largest size
  } else if (message.document) {
    attachmentType = 'document';
    fileId = message.document.file_id;
  } else if (message.voice) {
    attachmentType = 'voice';
    fileId = message.voice.file_id;
  }

  const textContent = message.text || message.caption || null;

  if (!textContent && !attachmentType) {
    await tg.sendMessage(chatId, "I couldn't read that. Please send text, a photo, a PDF, or a voice message.");
    return;
  }

  const { data: question, error } = await supabase
    .from('questions')
    .insert({
      category,
      user_id: userId,
      username: message.from.username || null,
      first_name: message.from.first_name || null,
      text_content: textContent,
      attachment_type: attachmentType,
      file_id: fileId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('insert question error:', error);
    await tg.sendMessage(chatId, "Sorry, something went wrong saving your question. Please try again.");
    return;
  }

  // These two don't depend on each other, so fire them together instead of
  // waiting on one before starting the other — cuts the response time roughly in half.
  await Promise.all([
    tg.sendMessage(
      chatId,
      `✅ Your question has been submitted!\n` +
      `Question #${question.id} has been sent to the IELTS DARDI team for approval.\n\n` +
      `📢 Once it's live, you can find it and the answers in ${CHANNEL_ID}.`,
      { reply_markup: { inline_keyboard: [[{ text: '📝 Ask another question', callback_data: 'restart' }]] } }
    ),
    forwardToAdmin(question, message),
  ]);
}

async function forwardToAdmin(question, originalMessage) {
  // Relay the exact original content (with attachment) to the admin first...
  await tg.copyMessage(ADMIN_CHAT_ID, originalMessage.chat.id, originalMessage.message_id);

  // ...then send the review card underneath it.
  const typeLabel = describeType(question);
  const reviewText =
    `<b>Question #${question.id}</b>\n\n` +
    `Category: ${label(question.category)}\n` +
    `Type: ${typeLabel}\n\n` +
    `Text:\n${question.text_content ? tg.escapeHtml(question.text_content) : '<i>(no text, see attachment above)</i>'}`;

  const sent = await tg.sendMessage(ADMIN_CHAT_ID, reviewText, { reply_markup: REVIEW_KEYBOARD(question.id) });

  if (sent.ok) {
    await supabase.from('questions').update({ admin_message_id: sent.result.message_id }).eq('id', question.id);
  }
}

function describeType(question) {
  const parts = [];
  if (question.text_content) parts.push('Text');
  if (question.attachment_type === 'photo') parts.push('Photo');
  if (question.attachment_type === 'document') parts.push('PDF/Document');
  if (question.attachment_type === 'voice') parts.push('Voice');
  return parts.length ? parts.join(' + ') : 'Text';
}

async function sendCategoryPicker(chatId) {
  return tg.sendMessage(
    chatId,
    "👋 What are you having trouble with? Choose a category:",
    { reply_markup: categoryKeyboard() }
  );
}

// ---------------------------------------------------------------------------
// Callback queries (category buttons + admin Publish/Edit/Reject)
// ---------------------------------------------------------------------------

async function handleCallback(cq) {
  const data = cq.data || '';
  const chatId = cq.message.chat.id;
  const userId = cq.from.id;

  if (data.startsWith('cat:')) {
    const category = data.slice(4);
    if (!CATEGORIES[category]) {
      await tg.answerCallbackQuery(cq.id, { text: 'Unknown category' });
      return;
    }
    await supabase.from('user_sessions').upsert({
      user_id: userId,
      state: 'awaiting_question',
      category,
      question_id: null,
    });
    // Remove the "choose your category" message so it doesn't linger once picked.
    await tg.answerCallbackQuery(cq.id);
    await tg.deleteMessage(chatId, cq.message.message_id);

    const prompt = await tg.sendMessage(
      chatId,
      `${label(category)}\n\n` +
      `Please send your question.\n\n` +
      `You can send:\n` +
      `• Text\n` +
      `• A photo or screenshot\n` +
      `• A PDF\n` +
      `• A voice message\n\n` +
      `We'll review it and publish it anonymously if it's suitable.`
    );

    if (prompt.ok) {
      await supabase
        .from('user_sessions')
        .update({ prompt_message_id: prompt.result.message_id })
        .eq('user_id', userId);
    }
    return;
  }

  if (data === 'restart') {
    await supabase.from('user_sessions').delete().eq('user_id', userId);
    await tg.answerCallbackQuery(cq.id);
    // Drop the "✅ submitted" confirmation now that they're starting a new one.
    await tg.deleteMessage(chatId, cq.message.message_id);
    await sendCategoryPicker(chatId);
    return;
  }

  // Everything below is an admin-only action.
  if (chatId !== ADMIN_CHAT_ID) {
    await tg.answerCallbackQuery(cq.id, { text: 'Not authorized' });
    return;
  }

  const [action, idStr] = data.split(':');
  const id = Number(idStr);
  if (!id) {
    await tg.answerCallbackQuery(cq.id);
    return;
  }

  if (action === 'pub') {
    await handlePublish(id, cq);
  } else if (action === 'rej') {
    await handleReject(id, cq);
  } else if (action === 'edit') {
    await handleEditStart(id, cq, userId);
  } else {
    await tg.answerCallbackQuery(cq.id);
  }
}

async function handlePublish(id, cq) {
  const { data: q, error } = await supabase.from('questions').select('*').eq('id', id).single();
  if (error || !q) {
    await tg.answerCallbackQuery(cq.id, { text: 'Question not found' });
    return;
  }
  if (q.status === 'published') {
    await tg.answerCallbackQuery(cq.id, { text: 'Already published' });
    return;
  }

  const channelText =
    `#${q.id} ${tag(q.category)}\n\n` +
    `❓ <b>${tg.escapeHtml(q.text_content || '')}</b>` +
    `${q.attachment_type ? '\n' + attachmentNote(q.attachment_type) : ''}`;

  let published;
  if (q.attachment_type && channelText.length <= 1024) {
    // Attachment + caption fits Telegram's 1024-char caption limit
    if (q.attachment_type === 'photo') published = await tg.sendPhoto(CHANNEL_ID, q.file_id, { caption: channelText });
    else if (q.attachment_type === 'document') published = await tg.sendDocument(CHANNEL_ID, q.file_id, { caption: channelText });
    else if (q.attachment_type === 'voice') published = await tg.sendVoice(CHANNEL_ID, q.file_id, { caption: channelText });
  } else if (q.attachment_type) {
    // Too long for a caption — send attachment, then the full text separately
    if (q.attachment_type === 'photo') await tg.sendPhoto(CHANNEL_ID, q.file_id);
    else if (q.attachment_type === 'document') await tg.sendDocument(CHANNEL_ID, q.file_id);
    else if (q.attachment_type === 'voice') await tg.sendVoice(CHANNEL_ID, q.file_id);
    published = await tg.sendMessage(CHANNEL_ID, channelText);
  } else {
    published = await tg.sendMessage(CHANNEL_ID, channelText);
  }

  await supabase
    .from('questions')
    .update({ status: 'published', published_message_id: published?.result?.message_id || null })
    .eq('id', id);

  await tg.answerCallbackQuery(cq.id, { text: 'Published ✅' });
  await tg.editMessageReplyMarkup(cq.message.chat.id, cq.message.message_id, {});
  await tg.editMessageText(cq.message.chat.id, cq.message.message_id, cq.message.text + '\n\n✅ <b>Published</b>');
}

function attachmentNote(type) {
  if (type === 'photo') return '📷 (Attached image)';
  if (type === 'document') return '📄 (Attached document)';
  if (type === 'voice') return '🎙️ (Attached voice message)';
  return '';
}

async function handleReject(id, cq) {
  await supabase.from('questions').update({ status: 'rejected' }).eq('id', id);
  await tg.answerCallbackQuery(cq.id, { text: 'Rejected' });
  await tg.editMessageReplyMarkup(cq.message.chat.id, cq.message.message_id, {});
  await tg.editMessageText(cq.message.chat.id, cq.message.message_id, cq.message.text + '\n\n❌ <b>Rejected</b>');
}

async function handleEditStart(id, cq, adminUserId) {
  await supabase.from('user_sessions').upsert({
    user_id: adminUserId,
    state: 'awaiting_edit',
    category: null,
    question_id: id,
  });
  await tg.answerCallbackQuery(cq.id);
  await tg.sendMessage(cq.message.chat.id, `Send the corrected text for <b>Question #${id}</b>.`);
}

async function handleAdminEditSubmit(id, newText, adminChatId) {
  const { data: q, error } = await supabase
    .from('questions')
    .update({ text_content: newText })
    .eq('id', id)
    .select()
    .single();

  if (error || !q) {
    await tg.sendMessage(adminChatId, 'Could not find that question anymore.');
    return;
  }

  await tg.sendMessage(adminChatId, `✅ Text updated for Question #${id}.`);

  // Re-send a fresh review card so the admin can Publish/Reject with the new text.
  const reviewText =
    `<b>Question #${q.id}</b> (edited)\n\n` +
    `Category: ${label(q.category)}\n` +
    `Type: ${describeType(q)}\n\n` +
    `Text:\n${tg.escapeHtml(q.text_content || '')}`;

  const sent = await tg.sendMessage(adminChatId, reviewText, { reply_markup: REVIEW_KEYBOARD(q.id) });
  if (sent.ok) {
    await supabase.from('questions').update({ admin_message_id: sent.result.message_id }).eq('id', q.id);
  }
}
