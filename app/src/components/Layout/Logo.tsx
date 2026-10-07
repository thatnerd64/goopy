import { useId } from "react";

// Vinyl record mark filled with the brand gradient
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3dd9c3" />
          <stop offset="0.55" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${id})`} />
      <circle
        cx="16"
        cy="16"
        r="10.5"
        fill="none"
        stroke="rgba(3,32,27,.35)"
        strokeWidth="1.2"
      />
      <circle
        cx="16"
        cy="16"
        r="7"
        fill="none"
        stroke="rgba(3,32,27,.28)"
        strokeWidth="1"
      />
      <circle cx="16" cy="16" r="4.2" fill="#0a0c10" />
      <circle cx="16" cy="16" r="1.3" fill="#3dd9c3" />
    </svg>
  );
}
