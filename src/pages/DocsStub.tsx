/**
 * Slice 0 /docs stub. Expands as each slice ships (SPEC.md §4 "Why These Choices?"
 * page is a separate, richer artifact shipped in Slice 10 — this route is the
 * plain engineering docs stub required by the walking skeleton).
 */
export function DocsStub() {
  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-4">
        <h1 className="font-display text-heading">Docs</h1>
        <p className="text-body text-muted-foreground">
          API and architecture docs land here as slices ship. See{' '}
          <code className="text-caption">Documentation/plan/IMPLEMENTATION_PLAN.md</code> in the repo for the
          full slice sequence.
        </p>
      </div>
    </main>
  )
}
