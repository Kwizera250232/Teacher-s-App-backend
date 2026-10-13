// Capture raw bytes that undici fetch sends — point at local nc listener
const crypto = require('crypto');
const BASE = 'http://127.0.0.1:18099'; // nc -l -p 18099
(async () => {
  const ref = crypto.randomUUID();
  try {
    await fetch(`${BASE}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer TESTTOKEN',
        'X-Reference-Id': ref,
        'X-Target-Environment': 'mtnrwanda',
        'Ocp-Apim-Subscription-Key': 'SUBKEY',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: '100', currency: 'RWF', externalId: 'test12345',
        payer: { partyIdType: 'MSISDN', partyId: '250783450859' },
        payerMessage: 'UClass — Test (30 days)', payeeNote: 'UClass class subscription',
      }),
    });
  } catch (e) { console.log('fetch err (expected):', e.message); }
})();
setTimeout(() => process.exit(0), 4000);
