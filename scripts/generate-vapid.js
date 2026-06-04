#!/usr/bin/env node
/** Print VAPID keys for .env (Web Push). */
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('Add these to your .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:admin@umunsi.com');
