import type { ReactNode } from 'react';

/** Thin line icons (Lucide geometry). */
const ICONS = {
  budget: <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  mail: <path d="M4 6h16v12H4zM4 7l8 6 8-6" />,
  calendar: <path d="M8 2v4M16 2v4M3 6h18v15H3zM3 10h18" />,
  calendarCheck: <path d="M8 2v4M16 2v4M3 6h18v15H3zM3 10h18M9 16l2 2 4-4" />,
  target: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />,
  goals: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  trend: <path d="M22 7l-8.5 8.5-5-5L2 17M16 7h6v6" />,
  arrowDown: <path d="M12 5v14M5 12l7 7 7-7" />,
  card: <path d="M2 5h20v14H2zM2 10h20" />,
  home: <path d="M3 11l9-8 9 8v10H3zM9 21v-6h6v6" />,
  basket: <path d="M5 8h14l-1.5 11h-11zM9 8l3-5 3 5" />,
  bank: <path d="M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10M3 10l9-6 9 6" />,
  transfer: <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </>
  ),
  download: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  plus: <path d="M5 12h14M12 5v14" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  lock: <path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />,
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  creditCard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  save: <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, stroke = 2.5, color = 'currentColor', style }: { name: IconName; size?: number; stroke?: number; color?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none', ...style }}>
      {ICONS[name]}
    </svg>
  );
}
