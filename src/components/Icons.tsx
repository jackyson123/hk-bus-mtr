import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
  'aria-hidden': true,
}

export function IconPin(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M12 21s6.5-5.4 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

export function IconRoute(p: P) {
  return (
    <svg {...base} {...p}>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H14a3.5 3.5 0 0 0 0-7H9.8a3.2 3.2 0 0 1 0-5H16" />
    </svg>
  )
}

export function IconSearch(p: P) {
  return (
    <svg {...base} {...p}>
      <circle cx="11" cy="11" r="6.3" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  )
}

export function IconStar({ filled, ...p }: P & { filled?: boolean }) {
  return (
    <svg
      {...base}
      {...p}
      fill={filled ? 'currentColor' : 'none'}
    >
      <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9L12 3.6Z" />
    </svg>
  )
}

export function IconBus(p: P) {
  return (
    <svg {...base} {...p}>
      <rect x="4" y="4" width="16" height="13" rx="3" />
      <path d="M4 10h16M8 20v-3M16 20v-3" />
      <path d="M8 13.5h.01M16 13.5h.01" strokeWidth="2.4" />
    </svg>
  )
}

export function IconTrain(p: P) {
  return (
    <svg {...base} {...p}>
      <rect x="5" y="3.5" width="14" height="13" rx="3.5" />
      <path d="M5 10.5h14M9 20l1.6-3.5M15 20l-1.6-3.5" />
      <path d="M9.5 7h5" />
    </svg>
  )
}

export function IconClock(p: P) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="8.3" />
      <path d="M12 7.6V12l3 1.8" />
    </svg>
  )
}

export function IconMap(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2-6-2Z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </svg>
  )
}

export function IconRefresh(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M20 11.5A8 8 0 0 0 6.4 6.6L4 9" />
      <path d="M4 4.5V9h4.5" />
      <path d="M4 12.5A8 8 0 0 0 17.6 17.4L20 15" />
      <path d="M20 19.5V15h-4.5" />
    </svg>
  )
}

export function IconChevron(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export function IconWalk(p: P) {
  return (
    <svg {...base} {...p}>
      <circle cx="13" cy="4.6" r="1.7" />
      <path d="M13 8.2 10 11l1.4 3.2-2 5.3M13 8.2l3.2 2.6.9 3.4M11.4 14.2l3.4 1.4.9 3.9" />
    </svg>
  )
}
