// Copy: Documentation/design/COPY_DECK.md — "Section cards".
export interface LibrarySection {
  category: number
  urlSlug: string
  title: string
  subLabel: string
}

export const LIBRARY_SECTIONS: LibrarySection[] = [
  { category: 1, urlSlug: 'equity', title: 'Equity', subLabel: 'Ownership in companies' },
  { category: 2, urlSlug: 'debt', title: 'Debt', subLabel: 'Lending your money, earning interest' },
  { category: 3, urlSlug: 'gold', title: 'Gold', subLabel: 'Tangible value, independent of markets' },
  { category: 4, urlSlug: 'hybrid-guaranteed', title: 'Hybrid & Guaranteed', subLabel: 'Structured returns with defined rules' },
  { category: 5, urlSlug: 'real-estate', title: 'Real Estate', subLabel: 'Property and land' },
  { category: 6, urlSlug: 'alternative', title: 'Alternative', subLabel: 'Beyond the mainstream' },
]

export function getSectionByUrlSlug(urlSlug: string): LibrarySection | undefined {
  return LIBRARY_SECTIONS.find((s) => s.urlSlug === urlSlug)
}
