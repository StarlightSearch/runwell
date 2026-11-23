import { useId } from "react";

/** Runwell's icon: an R traced by a run (steps down a spine, a loop back, a branch out to the result). */
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  const id = `rw-g-${useId().replace(/:/g, "")}`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d8cff" />
          <stop offset="1" stopColor="#9a6bff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 48V16h12.5c8.5 0 10.5 15 0 15.5H22" />
        <path d="M32.5 31.5 44 48" />
      </g>
      <circle cx="22" cy="48" r="4.5" fill="#fff" />
      <circle cx="44" cy="48" r="6" fill="#fff" />
    </svg>
  );
}
