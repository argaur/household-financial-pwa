import { describe, it, expect } from 'vitest'
import { assetClassEnum } from '../../drizzle/schema'
import { ASSET_CLASS_ORDER } from './allocation'

/**
 * `src/lib/allocation.ts` deliberately re-declares the asset-class list rather
 * than importing it from the Drizzle schema, because importing the schema
 * would pull `drizzle-orm/pg-core` into the browser bundle for code that is
 * meant to run client-side.
 *
 * That duplication is only safe if something fails loudly when the two drift.
 * A comment does not fail loudly; this test does. Without it, adding an asset
 * class to the schema would silently drop that class out of every allocation
 * donut — the holdings would still count toward `totalValue` but never appear
 * as a slice, so the percentages would quietly stop summing.
 */
describe('allocation asset classes stay in sync with the database enum', () => {
  it('lists exactly the same asset classes as drizzle assetClassEnum', () => {
    expect([...ASSET_CLASS_ORDER]).toEqual([...assetClassEnum])
  })

  it('lists them in the same order, because slice order is display order', () => {
    expect([...ASSET_CLASS_ORDER].join(',')).toBe([...assetClassEnum].join(','))
  })
})
