/**
 * What a signup/login email can do in UClass vs external mail providers.
 */
function schoolEmailCapabilities(kind = 'school') {
  const inApp = { send: true, receive: true };
  if (kind === 'school' || kind === 'staff') {
    return {
      login: true,
      in_app_messaging: inApp,
      external_email: { send: false, receive: false },
      summary:
        'UClass login and in-app Chats only. Not Gmail — cannot receive verification email from other sites (e.g. Cursor) unless your school hosts mail on this domain.',
    };
  }
  return {
    login: true,
    in_app_messaging: inApp,
    external_email: { send: true, receive: true },
    summary:
      'Use this email to sign in, for password reset (when enabled), and in UClass Chats. You can also use it in Gmail or your mail app.',
  };
}

module.exports = { schoolEmailCapabilities };
