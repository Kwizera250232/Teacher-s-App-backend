// Reproduce the app's exact requestToPay path and print raw responses
const fs = require('fs');
for (const line of fs.readFileSync('/home/umunsi/htdocs/studentapi.umunsi.com/.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const crypto = require('crypto');
const BASE = process.env.MTN_BASE_URL || 'https://proxy.momoapi.mtn.co.rw';
const ENV = process.env.MTN_TARGET_ENV || 'mtnrwanda';
const SK = process.env.MTN_SUBSCRIPTION_KEY;
const AU = process.env.MTN_API_USER;
const AK = process.env.MTN_API_KEY;

(async () => {
  // 1) token exactly like lib/mtnMomo.js
  const basic = Buffer.from(`${AU}:${AK}`).toString('base64');
  const tRes = await fetch(`${BASE}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': SK,
      'X-Target-Environment': ENV,
    },
  });
  const tText = await tRes.text();
  console.log('token status:', tRes.status, 'body:', tText.slice(0, 120));
  if (!tRes.ok) return;
  const token = JSON.parse(tText).access_token;

  // 2) requesttopay exactly like lib/mtnMomo.js
  const ref = crypto.randomUUID();
  const rRes = await fetch(`${BASE}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': ref,
      'X-Target-Environment': ENV,
      'Ocp-Apim-Subscription-Key': SK,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: '100',
      currency: 'RWF',
      externalId: String(ref).slice(0, 20),
      payer: { partyIdType: 'MSISDN', partyId: '250783450859' },
      payerMessage: 'UClass — Test (30 days)',
      payeeNote: 'UClass class subscription',
    }),
  });
  const rText = await rRes.text();
  console.log('requesttopay status:', rRes.status, 'body:', rText.slice(0, 400));
  console.log('ref:', ref);
})().catch(e => console.log('FATAL', e.message));
