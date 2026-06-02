export const STAFF_APPROVAL_MESSAGE = 'Tegereza gato UCLASS Staff';

export function isPendingTeacher(user) {
  return user?.role === 'teacher' && user?.is_approved === false;
}

export function staffApprovalErrorMessage(err) {
  const msg = String(err?.message || err || '');
  if (/STAFF_APPROVAL|tegereza gato/i.test(msg)) return STAFF_APPROVAL_MESSAGE;
  return msg;
}
