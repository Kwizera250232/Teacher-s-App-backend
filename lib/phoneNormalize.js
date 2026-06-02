/**
 * Rwanda mobile numbers for SMS (MTN/Airtel 07xxxxxxxx).
 * Returns E.164 (+2507XXXXXXXX) or null if invalid.
 */
function normalizeRwandaMobile(phone) {
  let p = String(phone || '').trim().replace(/\s/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  p = p.replace(/\D/g, '');
  if (p.startsWith('250')) p = p.slice(3);
  if (p.startsWith('0')) p = p.slice(1);
  if (p.length === 9 && /^7\d{8}$/.test(p)) {
    return `+250${p}`;
  }
  return null;
}

/** Display form: 078 123 4567 */
function formatRwandaMobileDisplay(e164) {
  const n = normalizeRwandaMobile(e164);
  if (!n) return null;
  const local = `0${n.slice(4)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

function validateRwandaMobileInput(phone) {
  const n = normalizeRwandaMobile(phone);
  if (!n) {
    return { valid: false, error: 'Enter a valid Rwanda mobile number (e.g. 0781234567).' };
  }
  return { valid: true, e164: n, display: formatRwandaMobileDisplay(n) };
}

module.exports = {
  normalizeRwandaMobile,
  formatRwandaMobileDisplay,
  validateRwandaMobileInput,
};
