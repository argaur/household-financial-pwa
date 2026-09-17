// jest-dom's own `types/vitest.d.ts` augments `vitest`'s pre-5 single-parameter
// `Assertion<T = any>`. Vitest 5 changed that interface to two parameters,
// `Assertion<R, T>` (see https://github.com/testing-library/jest-dom/issues/738),
// so jest-dom's shipped augmentation (still `Assertion<T>` as of 7.0.1) no
// longer merges and every jest-dom matcher (`toBeInTheDocument`, etc.)
// disappears from the type checker, even though it still works at runtime
// (registered via `expect.extend` in src/test/setup.ts).
//
// `@types/jest-axe`'s `toHaveNoViolations` has the same problem from a
// different angle: it only augments the global `jest.Matchers` / `@jest/expect`
// namespaces, which vitest 5's `JestAssertion<R, T>` no longer reads from.
//
// Fix for both: augment vitest's documented, still-stable extension point,
// `Matchers<R, T>`, directly instead of relying on either package's own
// (stale, for jest-dom; wrong-namespace, for jest-axe) type augmentation.
// Delete the jest-dom half once it ships a release that supports vitest 5's
// `Assertion<R, T>` shape; delete the jest-axe half if it ever adds a `vitest`
// namespace augmentation of its own.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  interface Matchers<R, T = unknown> extends TestingLibraryMatchers<T, R> {
    toHaveNoViolations(): R
  }
}
