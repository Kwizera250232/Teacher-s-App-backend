const fs = require('fs');
const f = 'c:/STUDENT APP/alumni-fixed.js';
let c = fs.readFileSync(f, 'utf8');
c = c.replace("const allowed = ['bio'", "const allowed = ['avatar_url','bio'");
fs.writeFileSync(f, c);
console.log('Added avatar_url to allowed fields');
