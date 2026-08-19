// Single source of truth for categories. Add/remove entries here only —
// the /start keyboard and every message that mentions a category reads from this.
const CATEGORIES = {
  reading:    { emoji: '📖', label: 'Reading' },
  listening:  { emoji: '🎧', label: 'Listening' },
  writing:    { emoji: '✍️', label: 'Writing' },
  speaking:   { emoji: '🎤', label: 'Speaking' },
  grammar:    { emoji: '📚', label: 'Grammar' },
  vocabulary: { emoji: '📗', label: 'Vocabulary' }, // distinct emoji from Reading so buttons are easy to tell apart at a glance
  general:    { emoji: '❓', label: 'General IELTS' },
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

module.exports = { CATEGORIES, categoryKeyboard, label };
