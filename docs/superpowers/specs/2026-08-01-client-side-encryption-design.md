# Client-Side Encryption Design

Status: Approved and locked (2026-08-01). This is a design spec, not an implementation plan — no code, schema, or config changes are part of this document.

## Context

The household-financial-pwa at finance.gauravg.dev currently stores every piece of household money data in Neon as plain text: on `holdings`, `invested_amount`, `current_value`, `monthly_sip`, `nominee`, and `notes`; on `protection`, `cover_amount`, `premium`, and `provider`; on `family_members`, `name` and `date_of_birth`. The full shape is in `drizzle/schema.ts`.

Tenant separation today is entirely application code: Hono reads `household_id` off the Clerk session on each request and scopes queries accordingly. There is no Postgres row-level security backing that separation — if the application layer ever queried without the household filter, or if anyone with direct database access looked at a row, the data would be fully readable.

The product wants to make the claim "we cannot read your data." That claim cannot be made honestly with a server-held encryption key, because whoever holds the key can decrypt everything under it regardless of application-layer scoping. This design moves the key out of server reach entirely — encryption and decryption happen in the browser, and the server only ever handles ciphertext.

## Locked decisions

| Decision | Choice |
|---|---|
| Encryption granularity | Whole row payload encrypted into one column, not field-by-field |
| Key source | User-set passphrase, separate from the Clerk login (Google sign-in means the app never sees a password) |
| Recovery | One-time recovery code shown at signup; no server-side copy; no account recovery path |
| Multi-device | Required — the wrapped key lives on the server so any device can unlock it given the passphrase |
| Old data | Wiped by hand; no backfill code |
| Onboarding placement | Passphrase screen comes first, immediately after account creation |
| Passphrase KDF | PBKDF2-SHA256, 600,000 rounds, using the browser's built-in WebCrypto implementation |
| KDF upgrade path | A `kdf_alg` column is stored per household so PBKDF2 can be swapped for Argon2id later without rewriting existing data |
| Key storage in browser | Non-extractable CryptoKey held in IndexedDB, paired with a strict CSP and an idle auto-lock |
| Analytics | Money-related properties are stripped from PostHog events; counts are kept |

## What we can honestly claim, and what we cannot

The claim this design supports is "we cannot read your data" — not "this is impossible to break." The application still serves the JavaScript that runs in the user's browser, so a compromised or malicious build could in principle capture the key or the plaintext before it is encrypted. This is the same structural limitation that Proton Mail and the Bitwarden web vault operate under, and it should be stated plainly in the product's security copy rather than glossed over.

**What the server still learns, in full:**
- How many holdings, family members, and protection records a household has (row counts are visible even though row contents are not).
- When each row was created and last changed (timestamps stay in plaintext).
- Which household is active and how frequently it is accessed.

Row size does not leak information beyond that, because every payload is padded to a fixed block size before encryption (see Row encryption below), so ciphertext length does not correlate with the real length of the underlying data.

**What XSS still defeats:** marking the CryptoKey non-extractable prevents a malicious script from copying the raw key bytes out of the browser. It does not prevent a malicious script running on our own origin from calling `decrypt()` using that key, since the key is usable in-page even though it cannot be exported. A strict Content-Security-Policy and an idle auto-lock reduce the window and blast radius of such an attack, but they do not close it. This limitation is accepted deliberately for this design and must be stated in any user-facing security documentation, not hidden behind the "non-extractable" language.

## Design

### Columns that stay readable

- `households.owner_user_id` — needed for Clerk-based scoping and cascade deletes.
- Every `id`, `household_id`, and `member_id` column across tables — needed for cascade deletes and tenant separation; a bare UUID reveals nothing on its own.
- `created_at` and `updated_at` on every table.
- The entire `instruments` table — this is public teaching content, identical for every household, and carries no household-specific information.

### Columns that become unreadable

- `holdings`: `instrument_id`, `asset_class`, `invested_amount`, `current_value`, `units`, `monthly_sip`, `start_date`, `maturity_date`, `nominee`, `is_emergency_fund`, `notes`
- `family_members`: `name`, `relationship`, `date_of_birth`, `risk_profile`
- `protection`: `type`, `cover_amount`, `premium`, `provider`, `status`
- `households`: `name`

Each of these tables keeps its primary/foreign keys and timestamps, and gains four new columns: `ciphertext text`, `iv text`, `alg text`, `version integer not null default 1`.

**Accepted cost:** `holdings.instrument_id` stops being a real foreign key once it moves inside the encrypted payload. This is acceptable because the browser already downloads the full public instrument library on load and can resolve the reference client-side. No other database constraint is affected by this design.

### Key management

- The browser generates a random 256-bit data encryption key (DEK) using `crypto.getRandomValues`.
- The DEK is wrapped twice, and both wrapped copies are stored on the server:
  - One wrapped by a key derived from the user's passphrase.
  - One wrapped by a key derived from a 128-bit recovery code, shown once at signup and encoded in Crockford base32.
- Wrapping uses AES-256-GCM. Each wrapped copy carries its own IV, and IVs are never reused between the two copies.
- The server never receives the passphrase, the recovery code, or the DEK itself — only the two wrapped (encrypted) copies of the DEK.
- **Unlock flow:** sign in with Clerk → fetch the wrapped DEK(s) from the server → prompt for the passphrase → unwrap the DEK in the browser → hold it in IndexedDB as a non-extractable CryptoKey. The DEK is never held as raw bytes and never written to localStorage.
- **Auto-lock:** after a configured idle period, the key is cleared from memory and from IndexedDB, and the user must re-enter the passphrase to continue.

### Row encryption

- AES-256-GCM is used for row payloads, with a fresh 96-bit IV generated for every write, including every update to an existing row.
- Before encryption, the row is serialized to JSON and padded up to the next multiple of 256 bytes. Without this padding step, the stored ciphertext length would reveal the approximate length of the plaintext — for example, giving away the rough magnitude of an amount or the length of a person's name.
- Additional authenticated data (AAD) passed to the AES-GCM cipher is the concatenation of `table_name`, `household_id`, `row_id`, and `version`. All four components matter:
  - The table name prevents a ciphertext from being replayed into a different table.
  - The household and row IDs prevent a ciphertext from being moved to a different family's data.
  - The version prevents an old copy of the same row from being replayed back over a newer one — something the IDs alone would not catch.
- The `version` column doubles as the concurrency control mechanism. Every write must include the version it read, and the server rejects the write if the stored version has since moved on. This replaces the current last-write-wins behavior, under which two phones writing concurrently could silently overwrite each other's entire encrypted row with no way to detect or merge the conflict.

### New table: `household_keys`

Columns: `household_id` (primary key, foreign key to `households.id`, on delete cascade), `kdf_alg`, `kdf_iterations`, `passphrase_salt`, `wrapped_dek_passphrase`, `passphrase_wrap_iv`, `recovery_salt`, `wrapped_dek_recovery`, `recovery_wrap_iv`, `created_at`, `updated_at`.

### Work that moves into the browser

Several pieces of server logic operate on plain objects with no database access and can move to the client largely unchanged, along with their existing tests:
- `computeCompleteness()` in `server/lib/dashboard.ts`
- `selectNudge()` and `buildNudgeContext()` in `server/lib/nudge.ts`
- `server/lib/household-checks.ts`

These move to `src/lib/`. The allocation loop currently in `dashboard.ts` becomes its own module, `src/lib/allocation.ts`, with its own tests.

`GET /api/dashboard` and `server/routes/dashboard.ts` are deleted entirely. Instead, the browser fetches members, holdings, and protection records, decrypts them client-side, and computes the tier, the allocation donut, and the nudge locally.

`DATA_MODEL.md` caps a household at roughly 50 holdings, so fetching the full set and decrypting it client-side is acceptable — this cap is recorded here as an explicit assumption this design depends on, not an incidental detail.

The write routes get correspondingly smaller: their Zod schemas stop describing money-shaped fields and instead describe the envelope `{ ciphertext, iv, alg, version }`. This means the server literally cannot accept a plaintext amount, even by mistake — the schema no longer allows it.

### Handling failures

- **One bad row must not break the page.** Each row is decrypted independently. If a single row fails to decrypt, it is rendered as "unreadable" and the rest of the page continues rendering normally. Failures are reported as a count, never with any content from the failed row.
- **Setup can be interrupted.** A household can end up with encrypted data rows but no corresponding `household_keys` row, or a `household_keys` row with no data yet. Both states need a named, deliberate recovery path triggered on next page load — this cannot be treated as an edge case that "shouldn't happen."
- **No caching of decrypted data.** All encrypted routes respond with `Cache-Control: no-store`. The service worker explicitly excludes these routes from its cache, so decrypted values never enter the PWA's offline cache.

### Export

Once the server holds nothing but unreadable ciphertext, a server-side data export is impossible by construction. To compensate, the browser needs a "download my data" feature that decrypts records client-side and saves them to a file. Without this, a lost passphrase means total, permanent data loss with no warning and no way to have taken a copy beforehand. This export capability is part of the feature as shipped, not a follow-up nice-to-have.

### Onboarding

A new first step is inserted before household creation. The passphrase and the one-time recovery code are presented together on a single screen, framed as the core product promise, with an explicit checkbox acknowledging that this cannot be recovered if lost.

`src/pages/HouseholdGate.tsx` already branches on what data exists for the signed-in user; it gains one additional branch — if no key material exists yet, route to key setup.

`/explore` and `/why` remain public and require no account, unaffected by this change.

A returning user who is signed in but has no key currently unlocked in the browser (new device, cleared browser storage, or an idle-lock timeout) is shown a passphrase prompt in front of the rest of the signed-in app, before any data is fetched or rendered.

## Risks and prerequisites

- **Neon backups are a prerequisite, not a follow-up.** After this change ships, losing the `household_keys` row for a household means its data can never be read again, even with a perfect database backup of the ciphertext — there is no key to recover. Neon's free tier only retains six hours of point-in-time recovery, so this needs to be understood and accepted (or the retention window extended) before this ships, not discovered afterward.
- **Rate limiting the key-fetch route is in scope**, tracked as SEC-001. A route that hands out wrapped keys with no rate limit is an open target for offline passphrase guessing against the wrapped DEK.
- **The destructive migration is a migration boundary.** Rolling application code back across it also requires a Neon point-in-time restore to bring the database back to a compatible plaintext state — a code-only rollback is not sufficient. Separately, after any Vercel instant rollback across this boundary, `vercel promote` must be run explicitly, since auto-promotion stops working at that point.
- **Measurement gets weaker.** Removing money-related properties from PostHog events reduces what can be measured about usage and outcomes. Onboarding drop-off specifically is a real, currently unmeasured risk introduced by adding a mandatory passphrase step before household creation — a PostHog event should be added on the key setup screen itself so this cost is measured rather than guessed at.

## How this will be verified

- Typecheck and the full test suite stay green, and grow to cover the new client-side logic.
- A screenshot of `SELECT * FROM holdings` in the Neon console showing unreadable ciphertext values, not plaintext.
- Manual second-device unlock: unlock the same household from a second device using only the passphrase.
- Manual recovery-code unlock on a cleared browser, with no passphrase entered.
- With IndexedDB cleared, nothing renders half-decrypted — the app either prompts for the passphrase or shows nothing sensitive.
- One deliberately corrupted row still allows the rest of the page to render, with the corrupted row shown as unreadable.
- A replayed old ciphertext at a stale version fails to decrypt (proves the AAD version binding works).
- Two holdings with very different note lengths produce ciphertext of the same length (proves padding works).
- The browser network tab carries no readable amount or asset class in any request or response.
- The axe accessibility scan stays at zero violations across all five affected screens.
