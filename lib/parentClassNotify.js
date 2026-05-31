const {
  resolveParentRecipients,
  insertParentNotification,
  sendParentInAppMessage,
} = require('./parentHub');

/** Notify linked parents in a class (in-app notification + chat). */
async function notifyClassParents({
  classId,
  senderId,
  senderRole,
  schoolId,
  studentId,
  type,
  title,
  body,
}) {
  const recipients = await resolveParentRecipients({
    senderId,
    senderRole,
    schoolId,
    classId: classId ? parseInt(classId, 10) : null,
    studentId: studentId ? parseInt(studentId, 10) : null,
  });
  if (!recipients.length) return 0;

  const messageTitle = String(title || '').trim();
  const messageBody = String(body || '').trim();
  if (!messageTitle || !messageBody) return 0;

  let sent = 0;
  for (const parent of recipients) {
    await insertParentNotification({
      parentId: parent.id,
      studentId: studentId || parent.student_id || null,
      senderId,
      type: type || 'info',
      title: messageTitle,
      body: messageBody,
    });
    await sendParentInAppMessage({
      senderId,
      parentId: parent.id,
      content: `📢 ${messageTitle}\n\n${messageBody}`,
      messageType: type || 'info',
    });
    sent += 1;
  }
  return sent;
}

module.exports = { notifyClassParents };
