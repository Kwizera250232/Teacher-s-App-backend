const crypto = require('crypto');

const SANDBOX_BASE = 'https://sandbox.momodeveloper.mtn.com';
const PRODUCTION_BASE = 'https://proxy.momoapi.mtn.co.rw';
const MIN_AMOUNT = 500;
const CURRENCY = 'RWF';

function getBase() {
  return process.env.MTN_BASE_URL || (process.env.MTN_TARGET_ENV === 'mtnrwanda' ? PRODUCTION_BASE : SANDBOX_BASE);
}

function getConfig() {
  const subscriptionKey = process.env.MTN_SUBSCRIPTION_KEY || '';
  const apiUser = process.env.MTN_API_USER || '';
  const apiKey = process.env.MTN_API_KEY || '';
  const env = process.env.MTN_TARGET_ENV || 'sandbox';
  return {
    subscriptionKey, apiUser, apiKey, env,
    configured: Boolean(subscriptionKey && apiUser && apiKey),
    live: env === 'mtnrwanda' || env === 'production',
  };
}

function getDisbursementConfig() {
  const subscriptionKey = process.env.MTN_DISBURSEMENT_KEY || process.env.MTN_SUBSCRIPTION_KEY || '';
  const apiUser = process.env.MTN_API_USER || '';
  const apiKey = process.env.MTN_API_KEY || '';
  const env = process.env.MTN_TARGET_ENV || 'sandbox';
  return {
    subscriptionKey, apiUser, apiKey, env,
    configured: Boolean(subscriptionKey && apiUser && apiKey),
  };
}

// ── Token caching (tokens last ~1h) ──
const tokenCache = { collection: { token: null, exp: 0 }, disbursement: { token: null, exp: 0 } };

async function getToken(kind) {
  const base = getBase();
  const cfg = kind === 'disbursement' ? getDisbursementConfig() : getConfig();
  const cache = tokenCache[kind];
  if (cache.token && Date.now() < cache.exp - 60000) return cache.token;
  const basic = Buffer.from(`${cfg.apiUser}:${cfg.apiKey}`).toString('base64');
  const res = await fetch(`${base}/${kind}/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
      'X-Target-Environment': cfg.env,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MTN ${kind} token failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  cache.token = data.access_token;
  cache.exp = Date.now() + (data.expires_in || 3600) * 1000;
  return cache.token;
}

const getCollectionToken = () => getToken('collection');
const getDisbursementToken = () => getToken('disbursement');

// ── Parse MTN error responses: body is JSON like {"code":"NOT_ENOUGH_FUNDS","message":"..."} ──
async function mtnError(res, label) {
  let body = '';
  let code = '';
  try {
    const text = await res.text();
    const j = JSON.parse(text);
    code = j.code || '';
    body = `${code} ${j.message || ''}`.trim() || text.slice(0, 300);
  } catch {
    body = '';
  }
  const err = new Error(`${label} failed (${res.status}): ${body || 'no details from MTN'}`);
  err.mtnCode = code;
  err.mtnStatus = res.status;
  return err;
}

function normalizePhone(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('250')) p = p.slice(3);   // 250783450859 → 783450859
  if (p.startsWith('0')) p = p.slice(1);     // 0783450859 → 783450859
  if (p.length === 9) p = `250${p}`;         // 783450859 → 250783450859
  if (!/^2507\d{8}$/.test(p)) {
    throw new Error('Enter a valid MTN Rwanda number (e.g. 0781234567).');
  }
  return p;
}

async function requestToPay({ phone, amount, payerMessage, payeeNote, referenceId }) {
  const cfg = getConfig();
  const token = await getCollectionToken();
  const ref = referenceId || crypto.randomUUID();
  const amt = Math.round(Number(amount));

  const res = await fetch(`${getBase()}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': ref,
      'X-Target-Environment': cfg.env,
      'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(amt),
      currency: CURRENCY,
      externalId: String(externalId || ref).slice(0, 20),
      payer: { partyIdType: 'MSISDN', partyId: normalizePhone(phone) },
      payerMessage: String(payerMessage || 'UClass subscription').slice(0, 100),
      payeeNote: String(payeeNote || 'UClass class access').slice(0, 100),
    }),
  });

  if (res.status !== 202 && !res.ok) {
    throw await mtnError(res, 'MTN payment request');
  }
  return { referenceId: ref, amount: amt, status: 'PENDING' };
}

async function getPaymentStatus(referenceId) {
  const cfg = getConfig();
  const token = await getCollectionToken();
  const res = await fetch(`${getBase()}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': cfg.env,
      'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
    },
  });
  if (res.status === 404) {
    // Transaction not yet registered at MTN — still initializing
    return { status: 'PENDING' };
  }
  if (!res.ok) {
    throw await mtnError(res, 'MTN status check');
  }
  return res.json();
}

// ── Disbursement: transfer money TO a MoMo number (teacher withdrawal) ──
async function transfer({ phone, amount, payeeNote, referenceId }) {
  const cfg = getDisbursementConfig();
  const token = await getDisbursementToken();
  const ref = referenceId || crypto.randomUUID();
  const amt = Math.round(Number(amount));

  const res = await fetch(`${getBase()}/disbursement/v1_0/transfer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': ref,
      'X-Target-Environment': cfg.env,
      'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(amt),
      currency: CURRENCY,
      externalId: String(externalId || ref).slice(0, 20),
      payee: { partyIdType: 'MSISDN', partyId: normalizePhone(phone) },
      payerMessage: 'UClass teacher earnings',
      payeeNote: String(payeeNote || 'UClass earnings withdrawal').slice(0, 100),
    }),
  });

  if (res.status !== 202 && !res.ok) {
    throw await mtnError(res, 'MTN transfer');
  }
  return { referenceId: ref, amount: amt, status: 'PENDING' };
}

async function getTransferStatus(referenceId) {
  const cfg = getDisbursementConfig();
  const token = await getDisbursementToken();
  const res = await fetch(`${getBase()}/disbursement/v1_0/transfer/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': cfg.env,
      'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MTN transfer status failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

module.exports = {
  getConfig, getDisbursementConfig,
  requestToPay, getPaymentStatus,
  transfer, getTransferStatus,
  MIN_AMOUNT, normalizePhone,
};
