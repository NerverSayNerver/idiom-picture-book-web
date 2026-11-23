import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#fcb69f',
        secondary: '#ffecd2',
        accent: '#f093fb',
        background: '#faf7f5',
        // ── 语义色单一来源 ──────────────────────────────────────────────
        // 全部用**字面色值**注册，不用 var()。原因见下，这是本轮最大的坑：
        //   bg-[var(--text-ink)]/[.06]   → Tailwind 的 withAlphaVariable 对
        //                                  parseColor('var(--x)') 返回 null，
        //                                  直接 return defaultValue，**规则被静默跳过**。
        //                                  不报错、不告警、DevTools 里类名还在，只是样式不存在。
        //   bg-ink/[.06]                 → background-color: rgb(74 44 32 / .06)  ✅
        //   不带修饰符的 bg-[var(--x)]    → 正常生成，不受影响。
        //
        // 【取值口径】两者等价，按是否需要透明度选择，不要混用：
        //   · 不需要透明度 → 用 CSS 变量形式 `text-[var(--text-ink)]`（与 globals.css 同步）
        //   · 需要透明度   → 必须用别名形式 `text-ink/40`、`bg-ink/[.06]`
        // 验收门禁：grep -rn "var(--[a-zA-Z-]*)\]/" --include=*.tsx app components 必须为 0
        //
        // 对比度（白底）：ink 12.56:1 / ink-body 7.88:1 / ink-mute 4.84:1 / brand 5.43:1
        ink: '#4a2c20',                    // 主文字（上一轮已有，保持）
        'ink-body': '#6b4a3a',             // 次要文字
        'ink-mute': '#8a6b5c',             // 辅助文字（达 WCAG AA）
        'ink-line': 'rgba(74,44,32,.08)',  // 发丝线：border-ink-line
        brand: '#B04A2E',                  // 文字/图标/指示器/激活态
        'brand-soft': '#FBE7DC',           // 选中底（配 brand 文字 4.55:1）
        success: '#15803D',                // 覆盖旧 #4caf50（2.8:1 不达标），全站零引用故安全
        'success-soft': '#E7F6EC',
        danger: '#B91C1C',                 // 6.47:1
        'danger-soft': '#FEE9E7',
        info: '#1D4ED8',                   // 6.70:1
        'info-soft': '#E8EFFD',
        warn: '#A16207',                   // 4.92:1
        'warn-soft': '#FEF6E0',
        warm: '#FFF8EC',                   // 诗词纸底：bg-warm
      },
      borderRadius: {
        'card': '16px',
        'button': '25px',
        // 卡内小容器（旁白块 / 原诗块 / 错误框 / 缩略图内框 / 筛选格）
        'inner': '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(74,44,32,.04), 0 4px 12px rgba(90,63,45,.08)',
        cardHover: '0 2px 4px rgba(74,44,32,.06), 0 10px 24px rgba(90,63,45,.12)',
        modal: '0 2px 8px rgba(60,40,30,.08), 0 12px 40px rgba(60,40,30,.18)',
      },
      fontFamily: {
        // 系统中文栈：0 网络字节。iOS/iPad=苹方、macOS=苹方、Windows=微软雅黑、Android=Noto Sans CJK。
        // 不要改回 next/font/google 的全量 Noto Sans SC：实测首页 36 个 woff2 / 1880KB。
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
          'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
          'Noto Sans CJK SC', 'sans-serif',
        ],
      },
      transitionDuration: {
        instant: '80ms', fast: '150ms', normal: '240ms',
        entrance: '320ms', slow: '360ms', flip: '560ms', poll: '1800ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
        enter: 'cubic-bezier(0.22, 1, 0.36, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce-soft': 'cubic-bezier(0.34, 1.35, 0.64, 1)',
        flip: 'cubic-bezier(0.42, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-down': { '0%': { opacity: '0', transform: 'translateY(-16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'modal-in': { '0%': { opacity: '0', transform: 'scale(.92)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'flip-next': { '0%': { transform: 'rotateY(0deg)' }, '18%': { transform: 'rotateY(-14deg) translateZ(10px)' }, '100%': { transform: 'rotateY(-180deg)' } },
        'flip-prev': { '0%': { transform: 'rotateY(0deg)' }, '18%': { transform: 'rotateY(14deg) translateZ(10px)' }, '100%': { transform: 'rotateY(180deg)' } },
        'sheen': { '0%': { opacity: '0' }, '25%': { opacity: '.85' }, '60%': { opacity: '.35' }, '100%': { opacity: '0' } },
        'page-shadow': { '0%': { opacity: '.45' }, '100%': { opacity: '0' } },
        'float-soft': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'breathe': { '0%,100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '.6', transform: 'scale(1.06)' } },
        'snail-bob': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        'collapse-in': { '0%': { opacity: '0', transform: 'translateY(-4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'page-in': { '0%': { opacity: '0', transform: 'translateX(8px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
      },
      animation: {
        'fade-up': 'fade-up 320ms cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 240ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-down': 'slide-down 260ms cubic-bezier(0.22,1,0.36,1) both',
        'modal-in': 'modal-in 240ms cubic-bezier(0.22,1,0.36,1) both',
        'flip-next': 'flip-next 560ms cubic-bezier(0.42,0,0.2,1) both',
        'flip-prev': 'flip-prev 480ms cubic-bezier(0.42,0,0.2,1) both',
        'sheen': 'sheen 1.4s linear infinite',
        'page-shadow': 'page-shadow 560ms cubic-bezier(0.42,0,0.2,1) both',
        'float-soft': 'float-soft 4.5s ease-in-out infinite',
        'breathe': 'breathe 2.4s ease-in-out infinite',
        'snail-bob': 'snail-bob 1.8s ease-in-out infinite',
        'collapse-in': 'collapse-in 240ms cubic-bezier(0.22,1,0.36,1) both',
        'page-in': 'page-in 240ms cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
}
export default config
