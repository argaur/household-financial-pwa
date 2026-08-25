import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared card-wrapper primitive for D-016 Slice 5's mint/treasury motif.
 * Documentation/design/COMPONENT_SHOWCASE.md's "D-016 Slice 5 — Mint/
 * Treasury Motif Components" table: states default + hover (lift), tokens
 * `border-border rounded-lg shadow-card`, `shadow-lift` on hover.
 *
 * Purely presentational — this chunk only builds the primitive. Chunks 2/3
 * apply it to the health/donut/nudge/ledger/counsel cards.
 *
 * `shadow-lift`'s companion translateY nudge mirrors the folio's
 * `.counsel-card:hover` rule (vittam-mint-folio.html: `transform:
 * translateY(-2px); box-shadow: var(--shadow-lift);`). The transition is
 * plain `transition-shadow`/`transform` duration classes — no custom
 * keyframes — so the project's existing global `prefers-reduced-motion`
 * block (src/styles/globals.css) already collapses it to nothing, same as
 * every other transition in this app.
 */
export type VaultFrameProps = HTMLAttributes<HTMLDivElement>

export const VaultFrame = forwardRef<HTMLDivElement, VaultFrameProps>(
  function VaultFrame({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-border shadow-card transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
