const { guestHasClassAccess } = require('./quizShares');

async function assertGuestClassAccess(userId, classId) {
  const cid = parseInt(classId, 10);
  if (!cid) return { ok: false, status: 400, error: 'Invalid class.' };
  const ok = await guestHasClassAccess(userId, cid);
  if (!ok) {
    return {
      ok: false,
      status: 403,
      error: 'Open a teacher’s shared quiz link to unlock this class as a guest.',
    };
  }
  return { ok: true, classId: cid };
}

module.exports = { assertGuestClassAccess, guestHasClassAccess };
