const crypto = require('crypto');

// transliteration map so Arabic names still produce a usable ASCII username
const AR_MAP = {
  'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'g', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a', 'ء': '',
};

function slugify(name) {
  const transliterated = name
    .split('')
    .map((ch) => AR_MAP[ch] ?? ch)
    .join('');
  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24) || 'user';
}

function generateUsername(fullName, isTaken) {
  const base = slugify(fullName);
  let candidate = base;
  let n = 1;
  while (isTaken(candidate)) {
    candidate = `${base}${++n}`;
  }
  return candidate;
}

function generateTempPassword() {
  // e.g. "Opt-7f3a29" — meets the 6+ char, mixed-case + digit rule used client-side
  return 'Opt-' + crypto.randomBytes(4).toString('hex');
}

module.exports = { generateUsername, generateTempPassword };
