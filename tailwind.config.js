/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Design system: semantic type scale (docs/DESIGN_SYSTEM.md) ──
      // 10px is the floor — text-[8px]/text-[9px] are banned by
      // tests/design-system.test.js. Prefer these names over raw px so a
      // future scale change is one edit.
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        caption: ['11px', { lineHeight: '16px' }],
        label: ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        body: ['13px', { lineHeight: '20px' }],
        'body-lg': ['14px', { lineHeight: '22px' }],
        title: ['16px', { lineHeight: '24px' }],
        headline: ['20px', { lineHeight: '28px' }],
        display: ['26px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        squircle: '22px',
        'squircle-sm': '16px',
        'squircle-xs': '12px',
        'squircle-lg': '28px',
        pill: '9999px',
        // Semantic aliases: controls (buttons/inputs) → ctl, cards → card,
        // large panels/modals → panel. Use these instead of picking among
        // rounded-md/lg/xl per file.
        ctl: '8px',
        card: '12px',
        panel: '16px',
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
        // ── Design system: semantic colors backed by CSS variables ──
        // These switch automatically with .dark (no dark: prefix, no
        // !important overrides needed). bg-surface, text-ink-muted,
        // border-line, bg-accent-soft, text-status-danger, etc.
        surface: {
          DEFAULT: 'var(--color-surface)',
          alt: 'var(--color-surface-alt)',
          alt2: 'var(--color-surface-alt2)',
          dim: 'var(--color-surface-dim)',
          body: 'var(--color-body-bg)',
        },
        ink: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          muted: 'var(--color-text-muted)',
          faint: 'var(--color-text-faint)',
        },
        line: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          strong: 'var(--color-accent-strong)',
          soft: 'var(--color-accent-soft)',
          text: 'var(--color-accent-text)',
        },
        status: {
          success: 'var(--color-success)',
          'success-soft': 'var(--color-success-soft)',
          warning: 'var(--color-warning)',
          'warning-soft': 'var(--color-warning-soft)',
          danger: 'var(--color-danger)',
          'danger-soft': 'var(--color-danger-soft)',
          info: 'var(--color-info)',
          'info-soft': 'var(--color-info-soft)',
          neutral: 'var(--color-neutral)',
          'neutral-soft': 'var(--color-neutral-soft)',
        },
        // Google Workspace brand — single source for every export surface.
        gbrand: {
          docs: '#1967D2',
          'docs-accent': '#4285F4',
          'docs-soft': '#E8F0FE',
          'docs-hover': '#D2E3FC',
          sheets: '#188038',
          'sheets-accent': '#34A853',
          'sheets-soft': '#E6F4EA',
          'sheets-hover': '#CEEAD6',
          slides: '#E37400',
          'slides-accent': '#F4B400',
          'slides-soft': '#FEF7E0',
          'slides-hover': '#FEEFC3',
        },
      },
    },
  },
  plugins: [],
};
