/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      borderRadius: {
        squircle: '22px',
        'squircle-sm': '16px',
        'squircle-xs': '12px',
        'squircle-lg': '28px',
        pill: '9999px',
      },
      boxShadow: {
        glass: '0 1px 2px rgba(0,0,0,0.02), 0 8px 32px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.5)',
        'glass-lg': '0 2px 4px rgba(0,0,0,0.02), 0 16px 48px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.4)',
        'glass-xl': '0 4px 8px rgba(0,0,0,0.02), 0 24px 64px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.4)',
        'glass-inset': 'inset 0 1px 1px rgba(255, 255, 255, 0.6)',
        btn: '0 1px 2px rgba(99,102,241,0.1), 0 4px 12px rgba(99,102,241,0.2)',
        'btn-hover': '0 4px 16px rgba(99,102,241,0.3), 0 8px 32px rgba(99,102,241,0.15)',
        'btn-green': '0 1px 2px rgba(34,197,94,0.1), 0 4px 12px rgba(34,197,94,0.2)',
        'glow-indigo': '0 0 20px rgba(99,102,241,0.15), 0 0 60px rgba(99,102,241,0.05)',
        'glow-violet': '0 0 20px rgba(139,92,246,0.15), 0 0 60px rgba(139,92,246,0.05)',
      },
      backdropBlur: {
        glass: '40px',
        'glass-lg': '60px',
      },
      animation: {
        'spring-in': 'springIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'spring-up': 'springUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'spring-scale': 'springScale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'stagger-1': 'fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both',
        'stagger-2': 'fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both',
        'stagger-3': 'fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both',
        'stagger-4': 'fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both',
        shimmer: 'shimmer 2s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        springIn: {
          '0%': { opacity: '0', transform: 'scale(0.9) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        springUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        springScale: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.7', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
      },
      colors: {
        glass: {
          white: 'rgba(255, 255, 255, 0.72)',
          'white-light': 'rgba(255, 255, 255, 0.5)',
          'white-heavy': 'rgba(255, 255, 255, 0.85)',
          border: 'rgba(255, 255, 255, 0.35)',
          'border-light': 'rgba(255, 255, 255, 0.18)',
        },
      },
    },
  },
  plugins: [],
};
