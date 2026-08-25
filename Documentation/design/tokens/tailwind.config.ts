import type { Config } from 'tailwindcss'

/*
  Tailwind config — Vittam (Household Financial Planning PWA)
  Design system: engraved currency / vault (D-016 Slice 5, 2026-08-25)
  "Light = fresh currency paper. Dark = vault interior."
  Extracted from Documentation/design/concept/vittam-mint-folio.html.
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
      sm:  '390px',    /* primary — iPhone 14 Pro. NOT the Tailwind default 640px —
                           this project redefines it deliberately (see app/CLAUDE.md
                           past-mistakes: the sm:-390px breakpoint trap, 2026-08-25) */
      md:  '768px',    /* tablet */
      lg: '1280px',    /* desktop */
    },

    container: {
      center: true,
      padding: '1rem',
    },

    extend: {
      /* ── Fonts ───────────────────────────────────────────────
         serif → Bodoni MT (fallback Didot, Playfair Display) — headlines,
                 tier names, page titles, figures with weight (hero numbers)
         sans  → Gill Sans Nova (fallback Gill Sans, Trebuchet MS) — all
                 UI text, labels, body, forms
         mono  → Cascadia Mono (fallback Consolas, SF Mono) — ledger labels,
                 tabular figures, ALL-CAPS eyebrows/section labels

         Usage rule: serif only for text ≥ 18px (headlines, tier names,
         donut-center totals). Mono only for eyebrows, mono labels, and
         `.tabular`/`.num` numeric displays — never for prose. Everything
         else: sans. DM Serif Display + Inter are retired by this pass.  */
      fontFamily: {
        serif: ['"Bodoni MT"', 'Didot', '"Playfair Display"', '"Times New Roman"', 'serif'],
        sans:  ['"Gill Sans Nova"', '"Gill Sans"', '"Trebuchet MS"', '"Segoe UI"', 'Candara', 'sans-serif'],
        mono:  ['"Cascadia Mono"', 'Consolas', '"SF Mono"', 'Menlo', 'monospace'],
      },

      /* ── Colors ──────────────────────────────────────────────
         Shadcn CSS-variable bridge (all semantic slots)
         + project-specific tokens (brass accent, asset classes, tier statuses) */
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
        panel: 'hsl(var(--panel))',   /* recessed surface — ledger table head, inset zones */
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          strong:     'hsl(var(--primary-strong))',
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
        border:      'hsl(var(--border))',
        'border-soft': 'hsl(var(--border-soft))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',

        /* ── Brass — second accent, present in BOTH light and dark ──
           (corrected 2026-08-25: an earlier pass scoped brass to dark
           mode only; the real folio uses it natively in both themes).
           Scoped uses only, mirroring the asset/tier discipline below:
           mono eyebrows, guilloche motif, coin-mark rims, dashed
           import-zone borders. Never generic UI chrome or a second
           primary button color.                                        */
        brass: {
          DEFAULT:    'hsl(var(--brass))',
          soft:       'hsl(var(--brass-soft))',
          foreground: 'hsl(var(--brass-foreground))',
        },

        /* ── Asset class palette ──────────────────────────────
           Used ONLY in the allocation donut chart segments and
           their matching legend dots. Never for UI chrome.
           Native per-theme CSS vars (dark is not light dimmed),
           mirroring --primary — promoted from fixed hex 2026-08-25
           (was flagged as a Phase-4 gap; fixed at Stage 4 instead
           of deferred, per Gaurav). Source values in globals.css.   */
        asset: {
          equity: 'hsl(var(--c-equity))',   /* deep mint-green, distinct from --primary */
          debt:   'hsl(var(--c-debt))',     /* slate-blue */
          gold:   'hsl(var(--c-gold))',     /* warm brass-adjacent gold */
          ef:     'hsl(var(--c-ef))',       /* emergency fund — teal-cyan, hatched fill in the donut */
          ssy:    'hsl(var(--c-ssy))',      /* muted purple */
          alt:    'hsl(var(--c-alt))',      /* terracotta */
        },

        /* ── Tier status colors ───────────────────────────────
           Used for: tier badge bg, tier badge text, tier border.
           Never used as generic status colors elsewhere.
           Always use as a pair: text on bg. Retained from v1 —
           the folio does not redesign the tier system, only its frame. */
        tier: {
          'getting-started': {
            DEFAULT: '#92400E',
            bg:      '#FEF3C7',
            border:  '#FDE68A',
          },
          'on-track': {
            DEFAULT: '#186A4F',   /* now mint, was teal */
            bg:      '#DEEBE2',
            border:  '#B7D8C6',
          },
          strong: {
            DEFAULT: '#166534',
            bg:      '#DCFCE7',
            border:  '#86EFAC',
          },
        },
      },

      /* ── Border radius ───────────────────────────────────────
         Folio's dominant scale: 10px fields/panels, 12px cards,
         14–16px larger cards, 38px the outer app-frame (desktop
         showcase chrome only, not a mobile screen radius), 999px
         pills/badges/theme-toggle, 50% circles (coin FAB, avatar,
         mintmark).                                                */
      borderRadius: {
        sm:  '0.25rem',                     /* 4px  — small badges, legend dots */
        DEFAULT: 'calc(var(--radius) - 2px)', /* 8px  — buttons, small elements */
        md:  'var(--radius)',               /* 10px — inputs, fields, panels */
        lg:  'calc(var(--radius) + 2px)',   /* 12px — standard cards */
        xl:  'calc(var(--radius) + 4px)',   /* 14px — larger cards, spec cards */
        '2xl': 'calc(var(--radius) + 6px)', /* 16px — app-bar cards, bottom sheets */
        pill: '999px',                       /* theme toggle, badges, ledger tabs */
        coin: '50%',                         /* FAB, avatar, mintmark */
      },

      /* ── Typography scale ────────────────────────────────────
         Named for their role, not their pixel size. Folio uses
         clamp() for hero/display sizes (responsive across the
         folio's desktop showcase width) — fixed rem values here
         since the app itself is mobile-first single-breakpoint,
         not a fluid desktop layout; use the folio's clamp() only
         if a future desktop-width screen needs it.                */
        fontSize: {
          'hero':      ['2.5rem', { lineHeight: '1.04', letterSpacing: '-0.01em' }],  /* 40px — landing hero, mobile-fit clamp(32,9vw,72) floor+ */
          'display':   ['1.875rem', { lineHeight: '1.15' }],                          /* 30px — closing/section headlines, tier name */
          'heading':   ['1.5rem',{ lineHeight: '1.3' }],                              /* 24px — page titles */
          'title':     ['1.125rem',{ lineHeight: '1.4' }],                            /* 18px — card titles, app-bar name (serif) */
          'body-lg':   ['1rem',  { lineHeight: '1.55' }],                             /* 16px — body copy, thesis */
          'body':      ['0.875rem',{ lineHeight: '1.5' }],                            /* 14px — standard UI text, ledger rows */
          'caption':   ['0.8125rem', { lineHeight: '1.4' }],                          /* 13px — compare-strip, counsel cards */
          'label':     ['0.75rem', { lineHeight: '1.4' }],                            /* 12px — helper text, legend pct/val */
          'eyebrow':   ['0.6875rem', { lineHeight: '1.4', letterSpacing: '.22em' }],  /* 11px — mono ALL-CAPS section labels */
        },

      /* ── Shadows ─────────────────────────────────────────────
         Folio defines two elevation levels plus an "emboss" inset
         highlight used on serif headlines (a subtle engraved-plate
         effect) — not a drop shadow, applied via text-shadow, not
         box-shadow; kept here as documentation, applied via a
         `.emboss` utility in globals.css rather than a Tailwind
         boxShadow key since it targets text-shadow.               */
      boxShadow: {
        card:  '0 1px 2px rgba(23,33,26,.06), 0 12px 32px -18px rgba(23,33,26,.25)',
        lift:  '0 2px 4px rgba(23,33,26,.07), 0 20px 44px -20px rgba(23,33,26,.32)',
        /* dark-mode values are set as CSS vars (--shadow / --shadow-lift in
           globals.css) since box-shadow color needs per-theme opacity, not
           just per-theme hue — apply via `shadow-[var(--shadow)]` in dark
           contexts, or promote to a CSS-var-backed utility if this pattern
           recurs across more than the card/lift pair.                     */
      },

      /* ── Animation ───────────────────────────────────────────
         Folio's own explicit rule (Stage 2 negative constraint):
         motion is utility-only, communicates state change, never
         decorative. No gradients, no blur (except the folio-header's
         sticky backdrop-blur, which is chrome, not content motion). */
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
