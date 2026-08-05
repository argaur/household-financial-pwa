import { Link, NavLink } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme'

/**
 * Persistent masthead — added in the 2026-08-05 design rework. Until then the
 * app had no navigation chrome at all: every screen was a bare column and
 * moving between sections relied on inline links. On a laptop that read as a
 * page fragment, not a product.
 *
 * Design language: a document's running head, not an app bar. Paper
 * background, a hairline rule, the serif wordmark at 20px (the floor for
 * DM Serif Display), quiet text links with the teal reserved for the active
 * section. No icons in the nav, no elevation.
 *
 * Mobile: the wordmark and theme toggle share the first row; the nav wraps
 * to a second row (order utilities below). Every target is >=44px.
 *
 * Mounted once in App.tsx above <Routes> so it never remounts on navigation.
 * Page-level tests render pages without it; site-header.test.tsx covers it.
 */

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
          className="order-1 mr-auto inline-flex min-h-11 items-center font-display text-xl leading-tight"
        >
          Household Financial Planning
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
            <HeaderLink to="/sign-in">Sign in</HeaderLink>
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
