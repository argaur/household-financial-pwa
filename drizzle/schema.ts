import { pgTable, uuid, text, boolean, numeric, integer, timestamp, date, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

/**
 * Schema source of truth: Documentation/design/DATA_MODEL.md.
 * Keep in sync — any field change here must be reflected there and vice versa.
 */

export const households = pgTable('households', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  ownerUserIdIdx: uniqueIndex('households_owner_user_id_idx').on(t.ownerUserId),
}))

export const relationshipEnum = ['self', 'spouse', 'child', 'parent', 'other'] as const
export const riskProfileEnum = ['conservative', 'moderate', 'aggressive'] as const

export const familyMembers = pgTable('family_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relationship: text('relationship', { enum: relationshipEnum }).notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  riskProfile: text('risk_profile', { enum: riskProfileEnum }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  householdIdIdx: index('family_members_household_id_idx').on(t.householdId),
}))

export const instruments = pgTable('instruments', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull(),
  category: integer('category').notNull(), // 1=Equity 2=Debt 3=Gold 4=Hybrid/Guaranteed 5=Real Estate 6=Alternative
  name: text('name').notNull(),
  summary: text('summary').notNull(),
  returns: text('returns').notNull(),
  tax: text('tax').notNull(),
  liquidity: text('liquidity').notNull(),
  risk: text('risk').notNull(),
  eligibility: text('eligibility').notNull(),
  minInvestment: text('min_investment').notNull(),
  rateValue: numeric('rate_value'),
  rateAsOf: date('rate_as_of'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugIdx: uniqueIndex('instruments_slug_idx').on(t.slug),
}))

export const assetClassEnum = ['equity', 'debt', 'gold', 'hybrid', 'real-estate', 'alternative'] as const

export const holdings = pgTable('holdings', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => familyMembers.id, { onDelete: 'cascade' }),
  instrumentId: uuid('instrument_id').notNull().references(() => instruments.id),
  assetClass: text('asset_class', { enum: assetClassEnum }).notNull(),
  investedAmount: numeric('invested_amount').notNull(),
  currentValue: numeric('current_value').notNull(),
  units: numeric('units'),
  monthlySip: numeric('monthly_sip'),
  startDate: date('start_date'),
  maturityDate: date('maturity_date'),
  nominee: text('nominee'),
  priceSource: text('price_source').notNull().default('manual'),
  isEmergencyFund: boolean('is_emergency_fund').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  householdIdIdx: index('holdings_household_id_idx').on(t.householdId),
  memberIdIdx: index('holdings_member_id_idx').on(t.memberId),
}))

export const protectionTypeEnum = ['term-life', 'health', 'disability', 'other'] as const
export const protectionStatusEnum = ['active', 'lapsed', 'pending'] as const

export const protection = pgTable('protection', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => familyMembers.id, { onDelete: 'cascade' }),
  type: text('type', { enum: protectionTypeEnum }).notNull(),
  coverAmount: numeric('cover_amount').notNull(),
  premium: numeric('premium'),
  provider: text('provider'),
  status: text('status', { enum: protectionStatusEnum }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  householdIdIdx: index('protection_household_id_idx').on(t.householdId),
}))

// v1.5 — schema only, no UI/routes in v1 (Documentation/design/DATA_MODEL.md)
export const goals = pgTable('goals', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetAmount: numeric('target_amount').notNull(),
  horizonYears: integer('horizon_years').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  event: text('event').notNull(),
  properties: jsonb('properties').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index('analytics_events_created_at_idx').on(t.createdAt),
}))

export const householdsRelations = relations(households, ({ many }) => ({
  familyMembers: many(familyMembers),
  holdings: many(holdings),
  protection: many(protection),
  goals: many(goals),
}))

export const familyMembersRelations = relations(familyMembers, ({ one, many }) => ({
  household: one(households, { fields: [familyMembers.householdId], references: [households.id] }),
  holdings: many(holdings),
  protection: many(protection),
}))

export const holdingsRelations = relations(holdings, ({ one }) => ({
  household: one(households, { fields: [holdings.householdId], references: [households.id] }),
  member: one(familyMembers, { fields: [holdings.memberId], references: [familyMembers.id] }),
  instrument: one(instruments, { fields: [holdings.instrumentId], references: [instruments.id] }),
}))

export const protectionRelations = relations(protection, ({ one }) => ({
  household: one(households, { fields: [protection.householdId], references: [households.id] }),
  member: one(familyMembers, { fields: [protection.memberId], references: [familyMembers.id] }),
}))
