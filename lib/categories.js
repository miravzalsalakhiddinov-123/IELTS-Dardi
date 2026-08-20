// Single source of truth for categories. Add/remove entries here only —
// the /start keyboard and every message that mentions a category reads from this.
// `tag` is the hashtag used in channel posts — Telegram hashtags can't contain
// spaces, so multi-word labels (e.g. "General IELTS") get a squashed version.
// Tags are lowercase on purpose (channel style: #reading, not #Reading).
const CATEGORIES = {
  reading:    { emoji: '📖', label: 'Reading',      tag: 'reading' },
  listening:  { emoji: '🎧', label: 'Listening',    tag: 'listening' },
  writing:    { emoji: '✍️', label: 'Writing',      tag: 'writing' },
  speaking:   { emoji: '🎤', label: 'Speaking',     tag: 'speaking' },
  grammar:    { emoji: '📚', label: 'Grammar',      tag: 'grammar' },
  vocabulary: { emoji: '📗', label: 'Vocabulary',   tag: 'vocabulary' }, // distinct emoji from Reading so buttons are easy to tell apart at a glance
  general:    { emoji: '❓', label: 'General IELTS', tag: 'generalielts' },
};

function categoryKeyboard() {
  const keys = Object.entries(CATEGORIES);
  const rows = [];
  for (let i = 0; i < keys.length; i += 2) {
    const row = keys.slice(i, i + 2).map(([key, c]) => ({
      text: `${c.emoji} ${c.label}`,
      callback_data: `cat:${key}`,
    }));
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

function label(key) {
  const c = CATEGORIES[key];
  return c ? `${c.emoji} ${c.label}` : key;
}

function tag(key) {
  const c = CATEGORIES[key];
  return c ? `#${c.tag}` : `#${key}`;
}

module.exports = { CATEGORIES, categoryKeyboard, label, tag };
