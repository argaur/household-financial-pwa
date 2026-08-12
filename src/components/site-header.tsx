import { Link, NavLink } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme'

/**
 * Persistent masthead, added in the 2026-08-05 design rework. Until then the
 * app had no navigation chrome at all: every screen was a bare column and
 * moving between sections relied on inline links. On a laptop that read as a
 * page fragment, not a product.
 *
 * Design language: a document's running head, not an app bar. Paper
 * background, a hairline rule, quiet text links with the teal reserved for
 * the active section. No icons in the nav, no elevation.
 *
 * The product is named Vittam, set in Yatra One: a Devanagari/Latin
 * companion typeface whose brush terminals nod to the name's Sanskrit
 * origin without setting it in Devanagari script. Reserved for the wordmark
 * only, never for headings or body (see tailwind.config.ts `fontWordmark`).
 * The wordmark carries an inline document mark: a filled rounded square
 * with three ruled lines inside it, the same shape as the app icon and
 * favicon (public/brand/icon-source.svg), standing in for a printed
 * one-page plan. The mark is decorative and aria-hidden; the link's
 * accessible name comes from the visible "Vittam" text next to it.
 *
 * Mobile: the wordmark and theme toggle share the first row; the nav wraps
 * to a second row (order utilities below). Every target is >=44px. Signed
 * out, "Sign in" is a single link whose classes change by breakpoint: a
 * filled primary button from md up, a plain nav link below md. One element,
 * not two, so there is always exactly one link named "Sign in" in the DOM.
 *
 * Mounted once in App.tsx above <Routes> so it never remounts on navigation.
 * Page-level tests render pages without it; site-header.test.tsx covers it.
 */

function BrandMark() {
  return (
    <svg
      viewBox="0 0 512 512"
      width="22"
      height="22"
      aria-hidden="true"
      data-testid="brand-mark"
      className="shrink-0"
    >
      <rect width="512" height="512" rx="96" className="fill-primary" />
      <rect x="146" y="112" width="220" height="288" rx="18" className="fill-card" />
      <rect x="178" y="176" width="156" height="16" rx="8" className="fill-primary" />
      <rect x="178" y="224" width="156" height="16" rx="8" className="fill-primary" />
      <rect x="178" y="272" width="104" height="16" rx="8" className="fill-primary" />
    </svg>
  )
}

function HeaderLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'inline-flex min-h-11 items-center px-2 text-body whitespace-nowrap rounded-sm',
          isActive ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  )
}

export function SiteHeader() {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="container flex flex-wrap items-center gap-x-2 py-1.5">
        <Link
          to="/"
          className="order-1 mr-auto inline-flex min-h-11 items-center gap-2 font-wordmark text-xl leading-tight"
        >
          <BrandMark />
          Vittam
        </Link>

        <nav
          aria-label="Primary"
          className="order-3 -mx-2 flex w-full flex-wrap items-center md:order-2 md:mx-0 md:w-auto"
        >
          <SignedIn>
            <HeaderLink to="/dashboard">Your plan</HeaderLink>
            <HeaderLink to="/portfolio">Holdings</HeaderLink>
            <HeaderLink to="/explore">Explore</HeaderLink>
            <HeaderLink to="/profile">Profile</HeaderLink>
          </SignedIn>
          <SignedOut>
            <HeaderLink to="/explore">Explore</HeaderLink>
            <HeaderLink to="/why">How it's built</HeaderLink>
            <HeaderLink to="/privacy">Privacy</HeaderLink>
            <Button
              asChild
              className="min-h-11 w-auto justify-start rounded-sm bg-transparent px-2 text-body font-normal text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground md:ml-2 md:justify-center md:rounded-md md:bg-primary md:px-4 md:font-medium md:text-primary-foreground md:shadow md:hover:bg-primary/90"
            >
              <Link to="/sign-in">Sign in</Link>
            </Button>
          </SignedOut>
        </nav>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="order-2 text-muted-foreground hover:text-foreground md:order-3 [&_svg]:size-5"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Moon className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </header>
  )
}
