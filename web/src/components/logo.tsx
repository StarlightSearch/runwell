/** The Pulsar mark. Same file as the favicon. */
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return <img className={className} src="/favicon.svg" width={size} height={size} alt="" aria-hidden draggable={false} />;
}
