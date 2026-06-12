/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light theme color system
        surface: '#F8F7F4',      // main background (warm off-white)
        card: '#FFFFFF',          // card/panel background
        overlay: '#F0EEE9',       // subtle overlay / hover bg
        line: '#E8E5DF',          // borders / dividers
        'line-strong': '#C8C4BC', // stronger borders

        ink: '#1A1917',           // primary text
        muted: '#6B6860',         // secondary text
        faint: '#9B9890',         // tertiary / placeholder

        accent: '#2563EB',        // primary accent blue
        'accent-tint': '#EFF4FF', // accent background
        'accent-hover': '#1D4ED8',

        positive: '#16A34A',      // success / complete
        'positive-tint': '#F0FDF4',
        warning: '#D97706',       // warning / deadline
        'warning-tint': '#FFFBEB',
        danger: '#DC2626',        // error / delete
        'danger-tint': '#FEF2F2',

        dark: {
          bg: 'var(--color-bg)',
          card: 'var(--color-card)',
          border: 'var(--color-border)',
          text: 'var(--color-text)',
          accent: 'var(--color-accent)',
        },

        // Task palette — 8 hues for gantt coloring
        task: {
          blue:   '#3B82F6',
          green:  '#10B981',
          amber:  '#F59E0B',
          purple: '#8B5CF6',
          rose:   '#F43F5E',
          cyan:   '#06B6D4',
          orange: '#F97316',
          lime:   '#84CC16',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        sm:  '0 1px 2px 0 rgba(0,0,0,0.05)',
        DEFAULT: '0 1px 4px 0 rgba(0,0,0,0.07)',
        md:  '0 4px 12px 0 rgba(0,0,0,0.08)',
        lg:  '0 8px 24px 0 rgba(0,0,0,0.10)',
      }
    },
  },
  plugins: [],
}
