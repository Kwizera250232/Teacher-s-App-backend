/** SQL interval filters for parent academic summary. */
function periodClause(period, dateColumn) {
  const col = dateColumn || 'created_at';
  const p = String(period || 'all').toLowerCase();
  if (p === 'today') {
    return { sql: ` AND ${col} >= CURRENT_DATE`, params: [] };
  }
  if (p === 'week') {
    return { sql: ` AND ${col} >= date_trunc('week', CURRENT_DATE)`, params: [] };
  }
  if (p === 'term') {
    return { sql: ` AND ${col} >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'`, params: [] };
  }
  return { sql: '', params: [] };
}

module.exports = { periodClause };
