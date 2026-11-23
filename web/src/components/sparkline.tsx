/** 14 daily counts, oldest first, as small bars with the total beside them; nothing when there were none. */
export function Sparkline({ values }: { values: number[] }) {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const max = Math.max(1, ...values);
  return (
    <span className="spark-wrap" aria-label={`${total} runs in 14 days`}>
      <span className="spark">
        {values.map((v, i) => (
          <i key={i} style={{ height: `${v ? Math.max(4, Math.round((v / max) * 16)) : 2}px` }} className={v ? "on" : ""} />
        ))}
      </span>
      <span className="spark-n">{total}</span>
    </span>
  );
}
