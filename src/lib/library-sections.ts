import type { AssetClass } from '@/lib/allocation'

// Copy: Documentation/design/COPY_DECK.md — "Section cards".
// assetClass links each section to the shared identity palette
// (src/lib/asset-classes.ts) so the library carries the same color a class
// has in the allocation donut.
export interface LibrarySection {
  category: number
  urlSlug: string
  title: string
  subLabel: string
  assetClass: AssetClass
}

export const LIBRARY_SECTIONS: LibrarySection[] = [
  { category: 1, urlSlug: 'equity', title: 'Equity', subLabel: 'Ownership in companies', assetClass: 'equity' },
  { category: 2, urlSlug: 'debt', title: 'Debt', subLabel: 'Lending your money, earning interest', assetClass: 'debt' },
  { category: 3, urlSlug: 'gold', title: 'Gold', subLabel: 'Tangible value, independent of markets', assetClass: 'gold' },
  { category: 4, urlSlug: 'hybrid-guaranteed', title: 'Hybrid & Guaranteed', subLabel: 'Structured returns with defined rules', assetClass: 'hybrid' },
  { category: 5, urlSlug: 'real-estate', title: 'Real Estate', subLabel: 'Property and land', assetClass: 'real-estate' },
  { category: 6, urlSlug: 'alternative', title: 'Alternative', subLabel: 'Beyond the mainstream', assetClass: 'alternative' },
]

export function getSectionByUrlSlug(urlSlug: string): LibrarySection | undefined {
  return LIBRARY_SECTIONS.find((s) => s.urlSlug === urlSlug)
}
