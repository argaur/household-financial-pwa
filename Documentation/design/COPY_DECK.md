# Copy Deck: Household Financial Planning PWA

**Voice principle:** A CFP speaking plainly to a new client. Direct. Assumes intelligence. Personal without being familiar. Educational without being condescending. Never sounds like a chatbot.

**Anti-patterns (banned from all copy):**
- "Let's get started on your financial journey!"
- "Unlock powerful insights"
- "No data found"
- Any filler that a CFP would delete before handing a document to a client

---

## Site header (added 2026-08-05)

One masthead on every route. Signed-out nav: Explore · How it's built · Privacy · Sign in. Signed-in nav: Your plan · Holdings · Explore · Profile. Wordmark: "Household Financial Planning" (links to `/`). Theme toggle labels: "Switch to dark theme" / "Switch to light theme".

---

## Onboarding

### Step 1: Create household (of 3)

| Element | Copy |
|---|---|
| Step indicator | Step 1 of 3 |
| Headline | "Let's start with your family." |
| Sub-headline | "Before we can plan, we need to know who we're planning for." |
| Field label | Your household name |
| Field placeholder | e.g. Gupta Family |
| Field helper | This appears as a label throughout your plan. It's just for you. |
| Primary CTA | Continue |

---

### Step 2: Add family members (of 3)

| Element | Copy |
|---|---|
| Step indicator | Step 2 of 3 |
| Headline | "Who are we planning for?" |
| Sub-headline | "Add everyone whose financial future you want to track." |
| Empty prompt (no members added yet) | "Start by adding yourself." |
| Add first member CTA | Add a family member |
| Add another CTA (after first member) | Add another member |
| **Add member form** | |
| Name field label | Full name |
| Relationship field label | Their relationship to you |
| DOB field label | Date of birth |
| DOB helper | Used to surface age-based milestones like SSY eligibility and retirement horizon. |
| Risk profile field label | Risk appetite |
| Risk profile helper | Optional. You can set this later. |
| Risk profile options | Conservative · Moderate · Aggressive |
| Save member CTA | Add to plan |
| Primary CTA (to proceed) | Continue |

---

### Step 3: Add first holding (of 3)

| Element | Copy |
|---|---|
| Step indicator | Step 3 of 3 |
| Headline | "What do you currently hold?" |
| Sub-headline | "Record your first investment or asset. You can add everything else after." |
| Instrument picker label | Instrument type |
| Instrument picker placeholder | Select an instrument |
| Member assignment label | Assign to |
| Invested amount label | Amount invested (₹) |
| Current value label | Current value (₹) |
| Current value helper | Your best estimate is fine. You can update this anytime. |
| Emergency fund checkbox label | Mark as emergency fund |
| Emergency fund checkbox helper | Check this if this holding serves as your household's emergency reserve. |
| Primary CTA | See my plan |

---

### Consent modal (shown once, before Step 1)

| Element | Copy |
|---|---|
| Headline | "Before we begin" |
| Body | "This tool helps you track and understand your household's financial picture. It does not constitute financial advice. For advice tailored to your situation, consult a SEBI-registered financial advisor." |
| Primary CTA | I understand, continue |

---

## Home / Dashboard

### Greeting & header

| Element | Copy |
|---|---|
| Page label (tab bar) | Home |
| Page title | Your plan |

---

### Household Health panel

| Element | Copy |
|---|---|
| Section header | Household health |
| Tier: 0–1 checks | Getting Started |
| Tier: 2–3 checks | On Track |
| Tier: 4–5 checks | Strong |
| Score sub-label | [N] of 5 checks complete |
| Tier context (Getting Started) | "Your plan is in its early stages. The steps below will strengthen it." |
| Tier context (On Track) | "Your household has the foundations covered. Keep building." |
| Tier context (Strong) | "Your household has a strong financial foundation across the essentials." |

---

### Allocation donut section

| Element | Copy |
|---|---|
| Section header | Where your money lives |
| Total label | Total recorded value |
| Empty state header | Nothing recorded yet. |
| Empty state body | "Add your first investment or asset to see how your household's money is distributed." |
| Empty state CTA | Record a holding |

---

### Nudge (single, first unmet check in order)

| Element | Copy |
|---|---|
| Section header | Next step |

**Check 1: Member without holdings:**
| Nudge body | "[Member name] has no holdings recorded yet. Every member in your plan should have at least one investment or asset mapped." |
| Nudge CTA | Add a holding for [member name] → |

**Check 2: No emergency fund:**
| Nudge body | "Your household has no emergency fund on record. This is the first safety net any plan needs, before any other investment." |
| Nudge CTA | Learn about emergency funds → |

**Check 3: Parent without protection:**
| Nudge body | "[Member name] has no protection cover on record. Term life cover is the foundation of a household financial plan. Everything else builds on it." |
| Nudge CTA | Learn about term insurance → |

**Check 4: Fewer than 3 asset classes:**
| Nudge body | "Your household's investments are concentrated in [N] asset class[es]. A well-rounded plan typically spans at least three different types." |
| Nudge CTA | Explore asset classes → |

**Check 5: Stale/missing current values:**
| Nudge body | "Some of your holdings don't have an up-to-date current value. Keeping these current is what makes your allocation accurate." |
| Nudge CTA | Update holdings → |

---

## Portfolio Tab

| Element | Copy |
|---|---|
| Tab label | Portfolio |
| Page title | Your holdings |
| Empty state header | Nothing recorded yet. |
| Empty state body | "Add your investments, savings, insurance, and assets to see your complete household picture." |
| Empty state CTA | Record your first holding |
| Group by member section header | [Member name]'s holdings |
| Holdings summary label | [N] holdings · ₹[total current value] |
| Add holding FAB tooltip | Record a holding |
| Edit holding CTA | Update |
| Remove holding CTA | Remove |
| Remove holding confirm dialog header | Remove this holding? |
| Remove holding confirm body | "This will remove [instrument name] from [member name]'s plan. This cannot be undone." |
| Remove holding confirm CTA | Remove |
| Remove holding cancel CTA | Keep it |

---

## Add / Edit Holding Form

| Element | Copy |
|---|---|
| Add form title | Record a holding |
| Edit form title | Update holding |
| Assign to label | For |
| Instrument label | Instrument |
| Asset class label | Asset class |
| Asset class helper | Auto-filled from the instrument you select. |
| Invested amount label | Amount invested (₹) |
| Current value label | Current value (₹) |
| Current value helper | Your best estimate. Update it whenever you review your portfolio. |
| Units label | Units held |
| Units helper | Applicable for mutual funds (units), gold (grams), etc. |
| Monthly SIP label | Monthly SIP amount (₹) |
| Monthly SIP helper | Leave blank if this is a lump sum or non-SIP holding. |
| Start date label | Start date |
| Maturity date label | Maturity date |
| Maturity date helper | Applicable for FDs, SSY, bonds, and similar instruments. |
| Nominee label | Nominee |
| Emergency fund label | Mark as emergency fund |
| Emergency fund helper | This holding is my household's emergency reserve. |
| Notes label | Notes |
| Notes placeholder | Any details you want to remember about this holding. |
| Save CTA (add) | Add to plan |
| Save CTA (edit) | Save changes |
| Cancel CTA | Cancel |

---

## Explore / Library

| Element | Copy |
|---|---|
| Tab label | Explore |
| Page title | What can you invest in? |
| Page sub-title | "30 instruments across 6 asset classes, explained plainly." |

### Section cards

| Section | Title | Sub-label |
|---|---|---|
| Equity | Equity | Ownership in companies |
| Debt | Debt | Lending your money, earning interest |
| Gold | Gold | Tangible value, independent of markets |
| Hybrid / Guaranteed | Hybrid & Guaranteed | Structured returns with defined rules |
| Real Estate | Real Estate | Property and land |
| Alternative | Alternative | Beyond the mainstream |

### Instrument list cards (updated 2026-08-05)

The list card shows **name, the full summary, and the risk level only**. It previously showed the full returns and risk paragraphs clamped to one CSS line each, which clipped them mid-sentence; a card never shows a truncated string. The risk level is the leading clause of the seeded risk copy (the text before its first em-dash, semicolon or period), extracted in `src/lib/instrument-preview.ts`. The full returns/tax/liquidity/risk paragraphs remain detail-page content.

| Element | Copy |
|---|---|
| Card title | [Instrument name] |
| Card body | [Instrument summary, unabridged] |
| Card risk row | Risk: [risk level] |

### Instrument detail page

| Element | Copy |
|---|---|
| Back label | [Section name] |
| Field: returns | Typical returns |
| Field: tax | Tax treatment |
| Field: liquidity | Liquidity |
| Field: risk | Risk level |
| Field: eligibility | Who can invest |
| Field: min investment | Minimum investment |
| Field: rate | Current rate |
| Rate staleness note | "Rate as of [date]. Verify before investing. Government rates change quarterly." |
| Add to portfolio CTA | Record this in my plan |

---

## Profile

| Element | Copy |
|---|---|
| Tab label | Profile |
| Page title | Your account |
| Household section header | Your household |
| Family members section header | Family members |
| Add member CTA | Add a family member |
| Account section header | Account |
| Sign out CTA | Sign out |
| Delete account CTA | Delete account |
| Delete account confirm header | Delete your account? |
| Delete account confirm body | "This will permanently delete your household, family members, and all holdings. This cannot be undone." |
| Delete account confirm CTA | Yes, delete everything |
| Delete account cancel CTA | Keep my account |

---

## "Why These Choices?" Page

| Element | Copy |
|---|---|
| Page title | How this was built |
| Sub-title | "Every decision in this product has a reason. Here's the thinking behind what you're using." |
| Intro paragraph | "Most financial products are built for brokers, not for households. This one was built to answer a simple question: what does a family actually need to know about their money, and what would it look like if someone built that clearly? The answer is what you're looking at." |

---

## PWA Install Prompt

| Element | Copy |
|---|---|
| Prompt header | Add to your home screen |
| Prompt body | "Install this as an app for quicker access and offline reading of the instrument library." |
| Install CTA | Install |
| Dismiss | Not now |

---

## Empty States: Global Pattern

Every empty state follows: **[What's missing]. [Why it matters in one sentence]. [Single CTA to fix it.]**

No "No data found." No "Nothing here yet!" No exclamation marks on empty states.

---

## Error States: Global Pattern

| Scenario | Copy |
|---|---|
| Network error on data fetch | "Couldn't load your data. Check your connection and try again." + Retry button |
| Save failed | "Something went wrong saving this. Your information hasn't changed." + Try again button |
| Form validation (required field) | "This field is required." |
| Form validation (invalid number) | "Enter a valid amount in rupees." |
| Auth session expired | "Your session has ended. Sign in to continue." + Sign in button |

---

## Projection Panel (added 2026-09-07, D-024)

Functional copy only. Every line follows the existing deck's register: state the fact, no exclamation marks, no persuasion. Zero em-dashes.

| Element | Copy |
|---|---|
| Panel title | How this could grow |
| Panel sub-label | An illustration based on assumptions you can change. Not a forecast. |
| Horizon label | Project forward |
| Horizon preset chips | 5 years / 10 years / 15 years / 20 years |
| Horizon custom label | Or enter a number of years |
| Horizon validation | Enter a number between 1 and 40. |
| Rate list heading | Assumed annual return |
| Rate row label | {Asset class} |
| Rate row helper (seeded) | Seeded from a published rate. Change it if you disagree. |
| Rate row helper (default) | A long-run assumption, not a published rate. Change it if you disagree. |
| Rate validation | Enter a rate between 0 and 30 percent. |
| Reset rates CTA | Reset to defaults |
| Maths disclosure CTA | See the maths |
| Maths panel heading | How this number was worked out |
| Maths panel formula line | Each holding grows at its assumed annual rate, compounded once a year, from its current value. Monthly SIP amounts are added at the start of each year. Nothing is adjusted for tax or inflation. |
| Maths panel source row | {Instrument or asset class} at {rate} percent. Source: {source}. Checked {date}. |
| Maths panel stale note | This rate was last checked more than a year ago. |
| Maths panel closing line | These are assumptions, not predictions. Change any rate above and the chart updates. |
| Empty state (no holdings) | Add a holding to this plan and a projection appears here. |
| Error state | Couldn't load your assumptions. Check your connection and try again. |

---

## Goal Planner (added 2026-09-07, D-024)

### "+ New" modal, third option

| Element | Copy |
|---|---|
| Option label | Plan toward a goal |
| Option helper | Describe what you are saving for and get a sample mix to start from. |
| Goal name label | What are you saving for? |
| Goal name placeholder | A short name you will recognise later |
| Goal name validation | Give this goal a name. |
| Target amount label | Amount you want to reach (₹) |
| Target amount validation | Enter a valid amount in rupees. |
| Target year label | By which year? |
| Target year validation | Enter a year between {next year} and {current year plus 40}. |
| Monthly capacity label | What you can add each month (₹) |
| Monthly capacity helper | Leave blank if you are not sure yet. |
| Continue CTA | Continue |
| Cancel CTA | Cancel |

### Consent step, shown before every call

| Element | Copy |
|---|---|
| Step title | This request leaves your device |
| Body line 1 | Your holdings are encrypted on your device and Vittam's servers cannot read them. This one request is the exception. |
| Body line 2 | What is sent: your asset mix as percentages, rounded totals, your goal name, and the instruments in your plan. |
| Body line 3 | What is not sent: your family members' names, nominees, exact amounts, or anything from your profile. |
| Body line 4 | The request goes to Anthropic, which processes it under its own API policy and may retain it for a period under that policy. Vittam's database does not store any of it. |
| Counter line | This uses one of your {remaining} remaining plans. It is counted when the request is sent, even if it fails. |
| Confirm CTA | Send this request |
| Cancel CTA | Not now |
| Link | How Vittam handles your data |

### Call in flight and results

| Element | Copy |
|---|---|
| In-flight label | Working on a sample mix |
| In-flight sub-label | This usually takes a few seconds. |
| Card title (goal plan) | One way to think about this goal |
| Card title (counsel) | One way to read this plan |
| Card caveat line | This is an illustration, not advice. Every number beside it was worked out on your device from the mix below. |
| Card allocation row | {Instrument name} · {weight} percent |
| Apply CTA | Add these to the plan |
| Dismiss CTA | Dismiss |
| Applied confirmation | Added to {ledger name}. You can change or remove anything from here. |
| No-suggestion state | No sample mix came back for this goal. Nothing was changed. |
| Failure state | Couldn't complete this request. Nothing was changed, and this attempt was counted. |
| Failure sub-line | You have {remaining} left. |

### Counsel entry point

| Element | Copy |
|---|---|
| CTA | Review this ledger |
| CTA helper | Get one reading of this plan's mix. Uses one of your {remaining} reviews. |

### Cap states, three distinct messages

| Element | Copy |
|---|---|
| Household plans exhausted, title | You have used both of your plans |
| Household plans exhausted, body | Building and editing plans by hand stays fully available. A paid tier with more is coming. |
| Ledger edits exhausted, title | You have used both reviews for this plan |
| Ledger edits exhausted, body | Other plans still have their own reviews. Editing this one by hand stays fully available. |
| Global limit reached, title | This feature is paused for the month |
| Global limit reached, body | Vittam runs on a fixed monthly budget for this, and it has been reached. Your own limits have not been used up. Everything else works as normal. |

---

## Bulk Import (added 2026-09-07, D-025)

### Entry point and disclosure

| Element | Copy |
|---|---|
| Entry CTA | Import from a spreadsheet |
| Entry helper | Add many holdings to {ledger name} at once. |
| Disclosure title | Before you download |
| Disclosure body 1 | The file is filled in with your family members' names so each person gets their own tab. |
| Disclosure body 2 | Once it is saved on your device, that file is a plain spreadsheet. Vittam's encryption does not cover it, and anything with access to your files can read it, including browser extensions. |
| Disclosure body 3 | Delete the file once you have imported it. |
| Download CTA | Download the template |
| Cancel CTA | Cancel |
| Generating label | Building your template |
| Generate failure | Couldn't build the template. Try again. |

### Upload

| Element | Copy |
|---|---|
| Upload title | Upload your filled template |
| Upload helper | Rows go into {ledger name}, the plan you have open. |
| Drop zone label | Drop your .xlsx file here, or choose a file |
| Choose CTA | Choose a file |
| Parsing label | Reading your file |
| Wrong file type | This needs to be an .xlsx file. |
| Unreadable file | Couldn't read this file. Download a fresh template and fill that in. |
| Wrong shape | This doesn't look like a Vittam template. Download a fresh one and fill that in. |
| Nothing filled in | This file has no amounts filled in yet. Add at least one and upload it again. |
| Too many rows | This file has {count} rows and a plan holds up to {cap}. Remove {over} and try again. |

### Review screen

| Element | Copy |
|---|---|
| Screen title | Check what will be added |
| Screen sub-label | Nothing is saved until you confirm. |
| Bucket: Ready | Ready to add ({count}) |
| Bucket: Needs attention | Needs attention ({count}) |
| Bucket: Possible duplicate | Possible duplicate ({count}) |
| Bucket: Skipped | Skipped ({count}) |
| Bucket helper: Ready | These will be added as they are. |
| Bucket helper: Needs attention | Something in the row could not be read. Fix it in the spreadsheet and upload again. |
| Bucket helper: Possible duplicate | {ledger name} already has this instrument for this person. Check before adding. |
| Bucket helper: Skipped | Nothing was filled in on these rows. |
| Duplicate row action | Add anyway |
| Primary CTA | Add {count} holdings to {ledger name} |
| Primary CTA, single row | Add 1 holding to {ledger name} |
| Rejects CTA | Download the rows that need attention |
| Leave confirm title | Leave without adding anything? |
| Leave confirm body | The rows you uploaded are only held while this screen is open. Nothing has been saved. |
| Leave confirm CTA | Leave |
| Leave cancel CTA | Stay here |

### Per-row reasons, column named, value never echoed

| Element | Copy |
|---|---|
| Unreadable amount | Amount invested is not a number I can read. |
| Unreadable current value | Current value is not a number I can read. |
| Shorthand rejected | Current value uses shorthand. Type the full number, like 150000. |
| Unreadable date | Start date is not a date I can read. |
| Date out of range | Maturity date is before the start date. |
| Unknown instrument | This instrument is not in Vittam's library. Use a row from the template. |
| Negative number | Amount invested cannot be negative. |
| Missing member | This tab does not match anyone in your household. |
| Notes too long | Notes is longer than this field holds. Shorten it and upload again. |

### Commit

| Element | Copy |
|---|---|
| Committing label | Adding your holdings |
| Success title | {count} holdings added to {ledger name} |
| Success body, clean | Nothing else was left over. |
| Success body, leftovers | {count} rows still need attention. Download them, fix them, and upload again. |
| Success CTA | View {ledger name} |
| Commit failure | Something went wrong adding these. Nothing was saved, and your rows are still here. |
| Commit failure CTA | Try again |
| Ledger full on commit | {ledger name} holds {current} of {cap} holdings, so these {attempted} do not fit. Remove some first. |
