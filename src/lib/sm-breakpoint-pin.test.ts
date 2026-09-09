import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * `sm:` fires at 390px in this project, not Tailwind's default 640px.
 * `tailwind.config.ts` sets `sm: '390px'` deliberately: 390px is the primary
 * phone width (iPhone 14 Pro), so a `sm:` modifier does not mean "wider than a
 * phone", it means "at a phone and up". Every responsive layout that should
 * stay stacked / full width on a phone must therefore use `md:`.
 *
 * This exact bug class has shipped to production twice:
 *   - D-016's compare strip used `sm:grid-cols-3`, firing a three column grid
 *     at exactly 390px.
 *   - D-021's CTA used `w-full sm:w-auto`, dropping a full width button to auto
 *     width at exactly 390px.
 *   - D-022/D-023 identified a third instance not yet pinned: the vendored
 *     `DialogFooter`/`SheetFooter` (`sm:flex-row sm:justify-end sm:space-x-2`)
 *     and the landing hero's CTA row (`sm:flex-row`) all go side-by-side at
 *     exactly 390px. Fixed to `md:` and pinned below (see CHUNK_FOOTER_FILES).
 * Both passed every test in the suite at the time. Both were found by a human
 * reading `tailwind.config.ts`, not by the suite. `SPEC.md` §G6.1 and §I6.1
 * turn that into an assertion, and this file is that assertion:
 *
 *   No new class string in this feature matches
 *   `sm:(grid-cols|w-auto|flex-row|inline-flex)`.
 *
 * ---------------------------------------------------------------------------
 * WHY AN EXPLICIT FILE LIST, AND NOT A GLOB
 * ---------------------------------------------------------------------------
 * The assertion is scoped to "this feature". The repository already contains
 * `sm:` usages that are out of scope and intentionally left alone (vendored
 * shadcn primitives, the landing hero). A broad glob would either fire on all
 * of them or need an exclusion list that grows silently. An explicit list is
 * auditable: a file that is missing from it is visibly missing, and a file that
 * no longer exists fails this suite loudly (see "staleness" below).
 *
 * The unit of coverage is the whole file, not the diff. Every file listed here
 * is either new in this feature or carries no `sm:` at all today, so whole file
 * coverage costs nothing and is strictly stronger than line scoping: a later
 * edit anywhere in a covered file is covered too. If a genuinely correct `sm:`
 * layout is ever needed in a covered file, that is a decision to make out loud
 * by editing this file, which is the point.
 *
 * ---------------------------------------------------------------------------
 * HOW A LATER STEP EXTENDS THIS
 * ---------------------------------------------------------------------------
 * Add the path to the matching `CHUNK_*_FILES` array below (one line), and if
 * the file renders markup, add one `RESPONSIVE_ANCHORS` entry naming a `md:`
 * class you know is in it (one line). Nothing else changes.
 *   - Step A10 fills `CHUNK_A_FILES` (goal step form fields, consent step
 *     Continue button, Apply/Dismiss pair, horizon preset chips, rate rows).
 *   - Step I15 fills `CHUNK_I_FILES` (template download button, upload drop
 *     zone, commit CTA, rejects download button, bucket header rows).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS PIN CANNOT PASS VACUOUSLY
 * ---------------------------------------------------------------------------
 * A static pin that inspects nothing is worse than no pin, because it reports
 * green. Four separate guards stop that here:
 *   1. Staleness — every listed path must exist. A rename or delete fails.
 *   2. Emptiness — every listed file must have real content after comments are
 *      stripped. A truncated or unreadable file fails.
 *   3. Anchors — the *stripped* text of each markup file must still contain a
 *      known `md:` class. This proves the scan read the real file, and proves
 *      the comment stripper did not eat the code.
 *   4. The stripper itself is unit tested against a fixture, so it can neither
 *      silently delete everything nor silently keep comments.
 * Test files are excluded by assertion, not by convention: a `.test.tsx` in the
 * list would make the pin fire on its own negative assertions.
 *
 * This file is never scanned by itself, so the pattern literals below and the
 * fixture string in the stripper test cannot self-trigger.
 */

const REPO_ROOT = resolve(__dirname, '../..')

/** Chunk E: deterministic projection engine. Verified against the tree 2026-09-09. */
const CHUNK_E_FILES = [
  'src/components/projection-panel.tsx',
  'src/lib/projection-settings-api.ts',
  'src/pages/Portfolio.tsx',
]

/** Chunk A: AI suggestion layer. Filled by plan step A10. */
const CHUNK_A_FILES: string[] = []

/** Chunk I: bulk Excel import. Filled by plan step I15. */
const CHUNK_I_FILES: string[] = []

/**
 * Footer/CTA stacking fix (2026-09-09, D-022/D-023 follow-up). Vendored shadcn
 * primitives and the landing hero were previously out of scope for this pin;
 * these three files are now the deliberately-scoped exception, fixed to `md:`.
 */
const CHUNK_FOOTER_FILES = [
  'src/components/ui/dialog.tsx',
  'src/components/ui/sheet.tsx',
  'src/pages/Landing.tsx',
]

const COVERED_FILES = [...CHUNK_E_FILES, ...CHUNK_A_FILES, ...CHUNK_I_FILES, ...CHUNK_FOOTER_FILES]

/**
 * One `md:` class per markup file that is known to be there. If a path is
 * silently redirected, emptied, or over-stripped, the anchor is what notices.
 * Files that render no markup are deliberately absent from this map.
 */
const RESPONSIVE_ANCHORS: Record<string, string[]> = {
  'src/components/projection-panel.tsx': ['md:grid-cols-2', 'md:hidden', 'md:block'],
  'src/pages/Portfolio.tsx': ['md:'],
  'src/components/ui/dialog.tsx': ['md:flex-row', 'md:justify-end', 'md:space-x-2'],
  'src/components/ui/sheet.tsx': ['md:flex-row', 'md:justify-end', 'md:space-x-2'],
  'src/pages/Landing.tsx': ['md:flex-row'],
}

/**
 * The forbidden modifiers. Assembled from parts so the whole literal never
 * appears in one piece, and guarded on the left so `text-sm:`-shaped tokens or
 * a longer prefix ending in `sm` cannot match.
 */
const FORBIDDEN_UTILITIES = ['grid-cols', 'w-auto', 'flex-row', 'inline-flex'] as const
const FORBIDDEN_PATTERN = new RegExp(`(?<![\\w-])sm:(${FORBIDDEN_UTILITIES.join('|')})`, 'g')

/**
 * Comments are stripped before scanning so that documenting the trap in prose
 * (`src/pages/InstrumentDetail.tsx` already does exactly that) is not itself a
 * violation.
 *
 * `//` only starts a comment when it is outside a quoted string, so the line is
 * walked with quote state rather than regex-replaced. A naive `[^:]//` rule
 * looked sufficient and was not: it truncated `"https://example.com/a//b"` at
 * the second slash, which the fixture test below caught. Over-stripping is the
 * dangerous direction here, because it deletes code the pin is meant to scan.
 */
export function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '')

  return withoutBlocks
    .split('\n')
    .map((line) => {
      let quote: string | null = null
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i]
        if (char === '\\') {
          i += 1
        } else if (quote) {
          if (char === quote) quote = null
        } else if (char === '"' || char === "'" || char === '`') {
          quote = char
        } else if (char === '/' && line[i + 1] === '/') {
          return line.slice(0, i)
        }
      }
      return line
    })
    .join('\n')
}

function read(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')
}

function violations(text: string): string[] {
  return text.match(FORBIDDEN_PATTERN) ?? []
}

describe('sm:-is-390px pin — coverage list integrity', () => {
  it('covers at least one file', () => {
    expect(COVERED_FILES.length).toBeGreaterThan(0)
  })

  it('lists no path twice', () => {
    expect(new Set(COVERED_FILES).size).toBe(COVERED_FILES.length)
  })

  it.each(COVERED_FILES)('%s still exists', (relativePath) => {
    expect(
      existsSync(resolve(REPO_ROOT, relativePath)),
      `${relativePath} is in this pin's coverage list but not on disk. It was renamed or ` +
        'deleted, so the pin has been covering nothing. Update the list rather than deleting it.',
    ).toBe(true)
  })

  it('lists no test file, whose own assertions would trip the pin', () => {
    const testFiles = COVERED_FILES.filter((p) => /\.test\.[cm]?[jt]sx?$/.test(p))
    expect(testFiles, 'test files assert on the forbidden strings and must not be scanned').toEqual([])
  })

  it('never scans itself', () => {
    expect(COVERED_FILES.some((p) => p.endsWith('sm-breakpoint-pin.test.ts'))).toBe(false)
  })

  it('anchors only files that are actually covered', () => {
    for (const anchored of Object.keys(RESPONSIVE_ANCHORS)) {
      expect(COVERED_FILES, `${anchored} has anchors but is not in the coverage list`).toContain(anchored)
    }
  })
})

describe('sm:-is-390px pin — the scan is really reading these files', () => {
  it.each(COVERED_FILES)('%s has real content after comments are stripped', (relativePath) => {
    const stripped = stripComments(read(relativePath)).trim()
    expect(stripped.length, `${relativePath} scanned empty — the pin would pass vacuously`).toBeGreaterThan(
      200,
    )
  })

  it.each(Object.entries(RESPONSIVE_ANCHORS))(
    '%s still carries the md: classes this pin expects to see',
    (relativePath, anchors) => {
      const stripped = stripComments(read(relativePath))
      for (const anchor of anchors) {
        expect(
          stripped,
          `${relativePath} no longer contains "${anchor}". Either the layout moved to a different ` +
            'breakpoint (check it is not sm:), or the scan is not reading what it thinks it is.',
        ).toContain(anchor)
      }
    },
  )
})

describe('sm:-is-390px pin — the assertion', () => {
  it.each(COVERED_FILES)('%s uses no sm: modifier that changes layout at 390px', (relativePath) => {
    const found = violations(stripComments(read(relativePath)))
    expect(
      found,
      `${relativePath} uses ${found.join(', ')}. In this project sm: fires at 390px, the primary ` +
        'phone width, so this changes the layout ON a phone rather than above one. Use md:. ' +
        'See SPEC.md §G6.1 and the two production bugs it records.',
    ).toEqual([])
  })
})

describe('sm:-is-390px pin — the pattern and the stripper behave', () => {
  it('matches every forbidden utility', () => {
    for (const utility of FORBIDDEN_UTILITIES) {
      expect(violations(`class="w-full sm:${utility} gap-2"`)).toHaveLength(1)
    }
  })

  it('does not match the md: equivalents this project wants instead', () => {
    expect(violations('class="grid grid-cols-1 md:grid-cols-2 md:flex-row md:w-auto"')).toEqual([])
  })

  it('does not match a token that merely ends in sm', () => {
    expect(violations('class="text-sm:grid-cols-2 prosm:w-auto"')).toEqual([])
  })

  it('does not match an unrelated sm: utility that is fine at 390px', () => {
    expect(violations('class="px-5 sm:px-8 sm:rounded-lg sm:text-left"')).toEqual([])
  })

  it('strips comments without eating code or URLs', () => {
    const fixture = [
      '/* a block comment naming sm:' + 'w-auto */',
      '// a line comment naming sm:' + 'grid-cols',
      'const docs = "https://example.com/a//b"',
      'const cls = "grid grid-cols-1 md:grid-cols-2"',
      'const kept = "px-2" // trailing note about sm:' + 'flex-row',
    ].join('\n')
    const stripped = stripComments(fixture)

    expect(violations(stripped), 'comments must not count as violations').toEqual([])
    expect(stripped).toContain('md:grid-cols-2')
    expect(stripped, 'a URL is not a line comment').toContain('https://example.com/a//b')
    expect(stripped, 'code before a trailing comment survives').toContain('const kept = "px-2"')
  })

  it('leaves a real violation standing after stripping', () => {
    const fixture = '/* prose */\nconst cls = "w-full sm:' + 'w-auto"'
    expect(violations(stripComments(fixture))).toHaveLength(1)
  })
})
