const PATHS = {
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6l7-3z" />
      <path d="M8.5 12l2.4 2.4L15.5 9.8" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <circle cx="9.5" cy="13" r="1.2" fill="currentColor" />
      <circle cx="14.5" cy="13" r="1.2" fill="currentColor" />
      <path d="M12 7V4" />
    </>
  ),
  external: <path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15V5h10" />
    </>
  ),
  send: <path d="M4 12l16-7-6 16-3-6-7-3z" fill="currentColor" />,
  github: <path d="M9 19c-4 1.3-4-2-6-2.5m12 5v-3.4a3 3 0 00-.8-2.3c2.8-.3 5.8-1.4 5.8-6.2a4.8 4.8 0 00-1.3-3.3 4.4 4.4 0 00-.1-3.3s-1-.3-3.4 1.3a11.7 11.7 0 00-6.2 0C6.6 2.7 5.6 3 5.6 3a4.4 4.4 0 00-.1 3.3A4.8 4.8 0 004.2 9.6c0 4.8 3 5.9 5.8 6.2a3 3 0 00-.8 2.3V21" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-[7px] bg-signal text-[#171204]" style={{ width: size, height: size }}>
      <Icon name="shield" size={size * 0.62} />
    </span>
  );
}
