const PATHS = {
  plus: 'M8 3.5v9M3.5 8h9',
  close: 'M4 4l8 8M12 4l-8 8',
  check: 'M3.5 8.5l3 3 6-7',
  'chevron-down': 'M4 6l4 4 4-4',
  'chevron-right': 'M6 4l4 4-4 4',
  'arrow-up': 'M8 13V3M4 7l4-4 4 4',
  'arrow-down': 'M8 3v10M4 9l4 4 4-4',
  search: 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM11 11l3.5 3.5',
  kanban: 'M2.5 3h3v10h-3zM6.5 3h3v6h-3zM10.5 3h3v8h-3z',
  linear: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM4.5 8h7M8 4.5v7',
  chat: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z',
  terminal: 'M2.5 3.5h11v9h-11zM5 6.5l2 1.5-2 1.5M8.5 10h2.5',
  code: 'M6 4.5L2.5 8 6 11.5M10 4.5l3.5 3.5-3.5 3.5',
  branch: 'M5 2.5v11M11 5.5a1.5 1.5 0 1 0 .01 0M11 7v.5a2.5 2.5 0 0 1-2.5 2.5H5',
  settings: 'M3 5h10M3 11h10M6 3v4M10 9v4',
  chart: 'M3 13V8M8 13V3M13 13V6',
  pencil: 'M10.5 3.5l2 2L6 12l-3 1 1-3z',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  'panel-right': 'M2.5 3h11v10h-11zM9.5 3v10'
} as const

export type IconName = keyof typeof PATHS

/** Inline stroke icon sized in em, so it follows the surrounding text and color. */
export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon-svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
