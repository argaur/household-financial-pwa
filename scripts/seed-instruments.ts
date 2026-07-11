import { config } from 'dotenv'
import { instrumentsSeedData } from '../server/seed/instruments-data.js'

// dotenv must run before server/lib/db.ts reads process.env.DATABASE_URL —
// static `import` is hoisted above any code in this file regardless of
// source order, so db.js is loaded dynamically after config() runs.
config({ path: '.env.local' })

/**
 * Idempotent: upserts by slug (the table's unique index), so re-running
 * after editing seed content updates existing rows instead of duplicating.
 */
async function main() {
  const { db } = await import('../server/lib/db.js')
  const { instruments } = await import('../drizzle/schema.js')

  for (const item of instrumentsSeedData) {
    await db
      .insert(instruments)
      .values({
        slug: item.slug,
        category: item.category,
        name: item.name,
        summary: item.summary,
        returns: item.returns,
        tax: item.tax,
        liquidity: item.liquidity,
        risk: item.risk,
        eligibility: item.eligibility,
        minInvestment: item.minInvestment,
        rateValue: item.rateValue,
        rateAsOf: item.rateAsOf,
      })
      .onConflictDoUpdate({
        target: instruments.slug,
        set: {
          category: item.category,
          name: item.name,
          summary: item.summary,
          returns: item.returns,
          tax: item.tax,
          liquidity: item.liquidity,
          risk: item.risk,
          eligibility: item.eligibility,
          minInvestment: item.minInvestment,
          rateValue: item.rateValue,
          rateAsOf: item.rateAsOf,
        },
      })
  }
  console.log(`Seeded ${instrumentsSeedData.length} instruments.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
