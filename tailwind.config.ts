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
        success: '#4caf50',
        background: '#faf7f5',
        // 浅色背景上的高对比文字色（primary 7.37:1 / accent 6.14:1，均达 WCAG AA）
        ink: '#4a2c20',
      },
      borderRadius: {
        'card': '16px',
        'button': '25px',
      },
      fontFamily: {
        sans: ['var(--font-noto-sans-sc)', 'Noto Sans SC', 'sans-serif'],
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
        'twinkle': { '0%,100%': { opacity: '.25', transform: 'scale(.85)' }, '50%': { opacity: '1', transform: 'scale(1.15)' } },
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
        'twinkle': 'twinkle 1.8s ease-in-out infinite',
        'snail-bob': 'snail-bob 1.8s ease-in-out infinite',
        'collapse-in': 'collapse-in 240ms cubic-bezier(0.22,1,0.36,1) both',
        'page-in': 'page-in 240ms cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
}
export default config
