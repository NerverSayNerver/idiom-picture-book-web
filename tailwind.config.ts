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
      },
      borderRadius: {
        'card': '16px',
        'button': '25px',
      },
      fontFamily: {
        sans: ['Noto Sans SC', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
