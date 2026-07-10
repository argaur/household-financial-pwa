import type { Config } from 'tailwindcss'

/*
  Tailwind config — Household Financial Planning PWA
  Design system: warm editorial × calm minimal (CFP one-pager)
  Mobile-first: 390px primary, 768px tablet, 1280px desktop
*/

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],

  theme: {
    /* ── Breakpoints ─────────────────────────────────────────── */
    screens: {
      sm:  '390px',    /* primary — iPhone 14 Pro */
      md:  '768px',    /* tablet */
      lg: '1280px',    /* desktop */
    },

    container: {
      center: true,
      padding: '1rem',
    },

    extend: {
      /* ── Fonts ───────────────────────────────────────────────
         display  → DM Serif Display — editorial headings, tier names, page titles
                    (warm, trustworthy; CFP document header quality)
         sans     → Inter — all UI text, labels, body, forms
                    (clean, accessible, already in shadcn baseline)

         Usage rule: display only for text ≥ 20px. Everything else: sans.
         Never use display at small sizes — the serif gets muddy.        */
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
      },

      /* ── Colors ──────────────────────────────────────────────
         Shadcn CSS-variable bridge (all semantic slots)
         + project-specific tokens (asset classes, tier statuses) */
      colors: {
        /* shadcn semantic bridge */
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input:  'hsl(var(--input))',
        ring:   'hsl(var(--ring))',

        /* ── Asset class palette ──────────────────────────────
           Used ONLY in the allocation donut chart segments and
           their matching legend dots. Never for UI chrome.
           Muted, sophisticated — annual report palette.          */
        asset: {
          equity:       '#2D6A6A',   /* deep teal       */
          debt:         '#475569',   /* slate            */
          gold:         '#B45309',   /* warm amber       */
          hybrid:       '#6D28D9',   /* muted purple     */
          'real-estate':'#15803D',   /* forest green     */
          alternative:  '#9F3939',   /* terracotta       */
        },

        /* ── Tier status colors ───────────────────────────────
           Used for: tier badge bg, tier badge text, tier border.
           Never used as generic status colors elsewhere.
           Always use as a pair: text on bg.                      */
        tier: {
          'getting-started': {
            DEFAULT: '#92400E',   /* amber-800  — text */
            bg:      '#FEF3C7',   /* amber-100  — background */
            border:  '#FDE68A',   /* amber-200  — border */
          },
          'on-track': {
            DEFAULT: '#1B6B6B',   /* teal       — text */
            bg:      '#E8F3F2',   /* teal tint  — background */
            border:  '#B2DFDB',   /* teal-200   — border */
          },
          strong: {
            DEFAULT: '#166534',   /* green-800  — text */
            bg:      '#DCFCE7',   /* green-100  — background */
            border:  '#86EFAC',   /* green-300  — border */
          },
        },
      },

      /* ── Border radius ───────────────────────────────────────
         Restrained rounding — not bubbly fintech, not sharp SaaS.
         Everything derives from --radius (0.5rem / 8px).         */
      borderRadius: {
        lg:  'var(--radius)',                        /* 8px  — cards */
        md:  'calc(var(--radius) - 2px)',            /* 6px  — buttons, inputs */
        sm:  'calc(var(--radius) - 4px)',            /* 4px  — badges, small elements */
        xl:  'calc(var(--radius) + 4px)',            /* 12px — bottom sheets only */
        '2xl': 'calc(var(--radius) + 8px)',          /* 16px — modals only */
      },

      /* ── Typography scale ────────────────────────────────────
         Named for their role, not their pixel size.
         Use these via Tailwind text-* classes.                   */
      fontSize: {
        'display':   ['2rem',  { lineHeight: '1.2', letterSpacing: '-0.01em' }],  /* 32px — tier name, hero number */
        'heading':   ['1.5rem',{ lineHeight: '1.3', letterSpacing: '-0.01em' }],  /* 24px — page titles */
        'title':     ['1.125rem',{ lineHeight: '1.4' }],                          /* 18px — card titles, section heads */
        'body-lg':   ['1rem',  { lineHeight: '1.6' }],                            /* 16px — nudge copy, descriptions */
        'body':      ['0.875rem',{ lineHeight: '1.5' }],                          /* 14px — standard UI text */
        'caption':   ['0.75rem', { lineHeight: '1.4' }],                          /* 12px — helper text, metadata */
      },

      /* ── Shadows ─────────────────────────────────────────────
         Minimal. Cards use border, not shadows, as the primary
         separation mechanism. Shadow used only for elevation.    */
      boxShadow: {
        card:   '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        sheet:  '0 -4px 24px -4px rgb(0 0 0 / 0.10)',   /* bottom sheets */
        modal:  '0 8px 32px -4px rgb(0 0 0 / 0.16)',    /* modals / consent */
      },

      /* ── Animation ───────────────────────────────────────────*/
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        shimmer:          'shimmer 1.6s linear infinite',
      },
    },
  },

  plugins: [
    require('tailwindcss-animate'),
  ],
}

export default config
