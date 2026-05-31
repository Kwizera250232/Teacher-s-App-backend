/** School/child context shown above parent–staff chat (from message context_json). */
export default function MessageContextBanner({ ctx }) {
  if (!ctx || typeof ctx !== 'object') return null;
  const districtLine = [ctx.district, ctx.sector].filter(Boolean).join(' · ');
  const lines = [
    ctx.student_name && `Child: ${ctx.student_name}`,
    ctx.school_name && `School: ${ctx.school_name}`,
    districtLine || null,
    ctx.welcome_message && `Note: ${ctx.welcome_message}`,
  ].filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="wa-context-banner">
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}
