/** Rewrite legacy mail.umunsi.com validation errors to @schoolname.edu. */
export function formatSchoolEmailError(message, expectedDomain) {
  const text = String(message || '');
  if (!text) return text;
  const dom = String(expectedDomain || '').trim().replace(/^@/, '');

  if (!/mail\.umunsi\.com/i.test(text)) return text;

  if (/email must end with/i.test(text) && dom) {
    return `Email must end with @${dom}.`;
  }
  if (dom) {
    return `Use @${dom} for student login — not @mail.umunsi.com. If this keeps happening, the API server needs updating.`;
  }
  return text.replace(/@[\w.-]*mail\.umunsi\.com/gi, '@schoolname.edu');
}
