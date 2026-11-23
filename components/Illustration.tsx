/**
 * 本地插画集：替代原先指向 trae-api-cn.mchost.guru 的 7 处外链（该接口已 404，
 * 且返回的是英文占位图 "The image is generating... Please refresh page to preview."）。
 *
 * 全部为纯 SVG、无网络依赖、无动画（reduced-motion 三态天然不受影响）。
 * 纯装饰：alt 语义由调用方的标题/按钮承担，因此统一 aria-hidden。
 * 调色板沿用 `--brand-strong-soft` / `--surface-warm` 的暖色系，不新增主题色。
 */

export type IllustrationName =
  | 'hero'
  | 'empty-shelf'
  | 'empty-search'
  | 'empty-tasks'
  | 'cover-fallback'
  | 'error'
  | 'not-found'
  | 'loading'

interface IllustrationProps {
  name: IllustrationName
  className?: string
}

const C = {
  soft: 'var(--brand-strong-soft)',
  warm: 'var(--surface-warm)',
  ink: '#7A4B34',
  brand: 'var(--brand-strong)',
  gold: '#E8B96A',
  leaf: '#8FAD7A',
  line: '#D8BCA8',
}

/** 统一的柔和底 + 几个装饰星点，所有插画共用 */
function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ellipse cx="100" cy="126" rx="78" ry="12" fill={C.soft} opacity=".55" />
      <circle cx="100" cy="74" r="62" fill={C.warm} opacity=".9" />
      {children}
      <path d="M34 44l2.2 5.8L42 52l-5.8 2.2L34 60l-2.2-5.8L26 52l5.8-2.2z" fill={C.gold} opacity=".75" />
      <path d="M166 34l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" fill={C.gold} opacity=".6" />
    </>
  )
}

function Book({ open = true }: { open?: boolean }) {
  return open ? (
    <g>
      <path d="M100 58c-13-9-29-11-45-7v56c16-4 32-2 45 7 13-9 29-11 45-7V51c-16-4-32-2-45 7z" fill="#fff" stroke={C.brand} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M100 58v56" stroke={C.brand} strokeWidth="2.5" />
      <path d="M66 66c8-1 15 0 21 3M66 78c8-1 15 0 21 3M113 69c6-3 13-4 21-3M113 81c6-3 13-4 21-3" stroke={C.line} strokeWidth="2" strokeLinecap="round" />
      <path d="M92 50l8-13 8 13" fill={C.gold} />
    </g>
  ) : (
    <g>
      <rect x="68" y="46" width="64" height="68" rx="7" fill="#fff" stroke={C.brand} strokeWidth="2.5" />
      <path d="M80 46v68" stroke={C.line} strokeWidth="2" />
      <path d="M97 62h24M97 72h24M97 82h16" stroke={C.line} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M122 40l2.4 6.6 6.6 2.4-6.6 2.4-2.4 6.6-2.4-6.6-6.6-2.4 6.6-2.4z" fill={C.gold} />
    </g>
  )
}

function Plant() {
  return (
    <g>
      <path d="M76 118h30l-3 16H79z" fill={C.brand} opacity=".8" />
      <path d="M91 118c-2-14-10-20-18-24 0 14 6 21 18 24zM91 118c2-16 10-23 20-27-1 16-8 24-20 27z" fill={C.leaf} />
    </g>
  )
}

function Sparkle({ x = 146, y = 96, s = 1 }: { x?: number; y?: number; s?: number }) {
  return (
    <path
      d={`M${x} ${y - 8 * s}l${2.4 * s} ${6.4 * s} ${6.4 * s} ${2.4 * s} -${6.4 * s} ${2.4 * s} -${2.4 * s} ${6.4 * s} -${2.4 * s} -${6.4 * s} -${6.4 * s} -${2.4 * s} ${6.4 * s} -${2.4 * s}z`}
      fill={C.gold}
      opacity=".8"
    />
  )
}

function Art({ name }: { name: IllustrationName }) {
  switch (name) {
    case 'hero':
      return (
        <Backdrop>
          <Book />
          <Sparkle x={52} y={60} s={1.1} />
          <Sparkle x={150} y={82} s={0.9} />
          <path d="M46 100c-4-4-4-10 0-14M154 100c4-4 4-10 0-14" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity=".7" />
        </Backdrop>
      )
    case 'empty-shelf':
      return (
        <Backdrop>
          <path d="M50 104h100M50 120h100" stroke={C.brand} strokeWidth="4" strokeLinecap="round" opacity=".75" />
          <Plant />
          <Sparkle x={128} y={68} s={0.8} />
        </Backdrop>
      )
    case 'empty-search':
      return (
        <Backdrop>
          <path d="M84 82h30v28H84z" fill="#fff" stroke={C.brand} strokeWidth="2.5" />
          <circle cx="113" cy="68" r="17" fill="none" stroke={C.brand} strokeWidth="3.5" />
          <path d="M125 80l16 16" stroke={C.brand} strokeWidth="4" strokeLinecap="round" />
          <Sparkle x={72} y={62} s={0.7} />
        </Backdrop>
      )
    case 'empty-tasks':
      return (
        <Backdrop>
          <circle cx="100" cy="78" r="26" fill="#fff" stroke={C.brand} strokeWidth="2.5" />
          <path d="M100 62v17l11 7" stroke={C.brand} strokeWidth="3" strokeLinecap="round" fill="none" />
          <Sparkle x={138} y={94} s={0.8} />
        </Backdrop>
      )
    case 'cover-fallback':
      return (
        <Backdrop>
          <Book open={false} />
        </Backdrop>
      )
    case 'error':
      return (
        <Backdrop>
          <path d="M68 82c0-14 12-25 27-25 11 0 20 6 24 15 11 0 19 8 19 18s-8 18-19 18H76c-8 0-14-6-14-13 0-6 3-10 6-13z" fill="#fff" stroke={C.brand} strokeWidth="2.5" />
          <path d="M94 80v14M94 101v1" stroke={C.brand} strokeWidth="3.5" strokeLinecap="round" />
        </Backdrop>
      )
    case 'not-found':
      return (
        <Backdrop>
          <path d="M100 44c-16 10-24 24-24 38a24 24 0 0048 0c0-14-8-28-24-38z" fill="#fff" stroke={C.brand} strokeWidth="2.5" />
          <path d="M100 66v18M100 92v1" stroke={C.brand} strokeWidth="3.5" strokeLinecap="round" />
          <Sparkle x={138} y={62} s={0.7} />
        </Backdrop>
      )
    case 'loading':
      return (
        <Backdrop>
          <Book />
          <path d="M140 92h20M140 100h14" stroke={C.line} strokeWidth="3" strokeLinecap="round" />
        </Backdrop>
      )
  }
}

export default function Illustration({ name, className = '' }: IllustrationProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 200 150"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <Art name={name} />
    </svg>
  )
}
