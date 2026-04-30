const { Pool } = require('pg');
require('dotenv').config();

function sanitizeDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();

  // If credentials contain unescaped '@', encode only the credential section.
  // Example: postgresql://user:pass@word@host:5432/db -> pass%40word
  const protoMatch = trimmed.match(/^(postgres(?:ql)?:\/\/)(.+)$/i);
  if (!protoMatch) return trimmed;

  const prefix = protoMatch[1];
  const rest = protoMatch[2];
  const lastAt = rest.lastIndexOf('@');
  if (lastAt === -1) return trimmed;

  const creds = rest.slice(0, lastAt);
  const hostPart = rest.slice(lastAt + 1);
  if (!creds.includes('@')) return trimmed;

  const safeCreds = creds.replace(/@/g, '%40');
  return `${prefix}${safeCreds}@${hostPart}`;
}

const connectionString = sanitizeDatabaseUrl(process.env.DATABASE_URL);

const pool = new Pool({ connectionString });

pool
  .query('SELECT 1')
  .then(() => console.log('[db] PostgreSQL connection ready'))
  .catch((err) => console.error('[db] Initial PostgreSQL connection failed:', err.message));

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

module.exports = pool;
