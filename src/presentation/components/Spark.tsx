/** Small line chart of a few balances (the « 6 mois » column of the page « Relevé »). */
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div />;
  const mn = Math.min(...values);
  const sp = Math.max(...values) - mn || 1;
  const pts = values.map((v, i) => [(i * 84) / (values.length - 1), 3 + 20 * (1 - (v - mn) / sp)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <div>
      <svg viewBox="0 0 84 26" width="84" height="26" style={{ display: 'block', overflow: 'visible' }}>
        <path d={d} fill="none" stroke="var(--t-base)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="3" fill="#fff" stroke="var(--t-base)" strokeWidth="2" />
      </svg>
    </div>
  );
}
