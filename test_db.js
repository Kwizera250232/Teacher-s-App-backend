const db = require('./db');
console.log('DB module:', typeof db);
console.log('Pool:', typeof db.query);
console.log('Pool object:', db);
process.exit(0);
