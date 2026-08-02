import { describe, it, expect, vi, afterEach } from 'vitest'
import { triggerTextDownload } from './download'

/**
 * The export's contents are proved in export.test.ts. This covers the part that
 * actually gets the file onto the user's disk — and, more importantly, that the
 * object URL is revoked afterwards. A decrypted household left reachable at a
 * blob: URL for the lifetime of the tab is the same leak the encryption work
 * exists to close.
 */
describe('triggerTextDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('downloads under the given filename and releases the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:fake-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    const clicked: HTMLAnchorElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'a') {
        const anchor = el as HTMLAnchorElement
        anchor.click = () => clicked.push(anchor)
      }
      return el
    })

    triggerTextDownload('household-financial-plan-2026-08-02.json', '{"a":1}')

    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('household-financial-plan-2026-08-02.json')
    expect(clicked[0].href).toContain('blob:fake-url')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('leaves no anchor behind in the document', () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    const before = document.querySelectorAll('a').length

    triggerTextDownload('f.json', '{}')

    expect(document.querySelectorAll('a').length).toBe(before)
  })
})
