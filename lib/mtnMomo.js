const crypto = require('crypto');

const SANDBOX_BASE = 'https://sandbox.momodeveloper.mtn.com';
const MIN_AMOUNT = 500;
const CURRENCY = 'RWF';

function getConfig() {
  const subscriptionKey = process.env.MTN_SUBSCRIPTION_KEY || '';
  const apiUser = process.env.MTN_API_USER || '';
  const apiKey = process.env.MTN_API_KEY || '';
  const env = process.env.MTN_TARGET_ENV || 'sandbox';
  return { subscriptionKey, apiUser, apiKey, env, configured: Boolean(subscriptionKey && apiUser && apiKey) };
}

async function getCollectionToken() {
  const { subscriptionKey, apiUser, apiKey } = getConfig();
  const basic = Buffer.from(`${apiUser}:${apiKey}`).toString('base64');
  const res = await fetch(`${SANDBOX_BASE}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MTN token failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token;
}

function normalizePhone(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('250')) p = p.slice(3);
  if (p.length === 9) p = `250${p}`;
  if (!/^2507\d{8}$/.test(p)) {
    throw new Error('Enter a valid MTN Rwanda number (e.g. 0781234567).');
  }
  return p;
}

async function requestToPay({ phone, amount, payerMessage, referenceId }) {
  const { subscriptionKey, env } = getConfig();
  const token = await getCollectionToken();
  const ref = referenceId || crypto.randomUUID();
  const amt = Math.max(MIN_AMOUNT, Math.round(Number(amount)));

  const res = await fetch(`${SANDBOX_BASE}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': ref,
      'X-Target-Environment': env,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(amt),
      currency: CURRENCY,
      externalId: ref.slice(0, 36),
      payer: { partyIdType: 'MSISDN', partyId: normalizePhone(phone) },
      payerMessage: payerMessage || 'UClass education support',
      payeeNote: 'Thank you for supporting UClass',
    }),
  });

  if (res.status !== 202 && !res.ok) {
    const text = await res.text();
    throw new Error(`MTN payment request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return { referenceId: ref, amount: amt, status: 'PENDING' };
}

async function getPaymentStatus(referenceId) {
  const { subscriptionKey, env } = getConfig();
  const token = await getCollectionToken();
  const res = await fetch(`${SANDBOX_BASE}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': env,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MTN status check failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

module.exports = { getConfig, requestToPay, getPaymentStatus, MIN_AMOUNT, normalizePhone };
