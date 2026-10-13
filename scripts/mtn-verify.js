// Verify the deployed fix: requestToPay with the app's real (em-dash) message
const fs = require('fs');
for (const line of fs.readFileSync('/home/umunsi/htdocs/studentapi.umunsi.com/.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { requestToPay, getPaymentStatus } = require('/home/umunsi/htdocs/studentapi.umunsi.com/lib/mtnMomo');

(async () => {
  const r = await requestToPay({
    phone: '0783450859',
    amount: 100,
    payerMessage: 'UClass — S6 Test Class (30 days)',  // em-dash like production code
    payeeNote: 'UClass class subscription',
  });
  console.log('requestToPay OK:', JSON.stringify(r));
  await new Promise(s => setTimeout(s, 3000));
  const st = await getPaymentStatus(r.referenceId);
  console.log('status:', JSON.stringify(st));
})().catch(e => console.log('FAIL:', e.message));
