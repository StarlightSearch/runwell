/** 14 daily counts, oldest first, as small bars; today's bars are blue. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  if (!values.some((v) => v > 0)) return <span className="desc">none</span>;
  return (
    <span className="spark" aria-label={`${values.reduce((a, b) => a + b, 0)} runs in 14 days`}>
      {values.map((v, i) => (
        <i key={i} style={{ height: `${v ? Math.max(3, Math.round((v / max) * 18)) : 2}px` }} className={v ? "on" : ""} />
      ))}
    </span>
  );
}
