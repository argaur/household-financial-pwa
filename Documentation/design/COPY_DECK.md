# Copy Deck — Household Financial Planning PWA

**Voice principle:** A CFP speaking plainly to a new client. Direct. Assumes intelligence. Personal without being familiar. Educational without being condescending. Never sounds like a chatbot.

**Anti-patterns (banned from all copy):**
- "Let's get started on your financial journey!"
- "Unlock powerful insights"
- "No data found"
- Any filler that a CFP would delete before handing a document to a client

---

## Onboarding

### Step 1 — Create household (of 3)

| Element | Copy |
|---|---|
| Step indicator | Step 1 of 3 |
| Headline | "Let's start with your family." |
| Sub-headline | "Before we can plan, we need to know who we're planning for." |
| Field label | Your household name |
| Field placeholder | e.g. Gupta Family |
| Field helper | This appears as a label throughout your plan — it's just for you. |
| Primary CTA | Continue |

---

### Step 2 — Add family members (of 3)

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
| DOB helper | Used to surface age-based milestones — SSY eligibility, retirement horizon, etc. |
| Risk profile field label | Risk appetite |
| Risk profile helper | Optional — you can set this later. |
| Risk profile options | Conservative · Moderate · Aggressive |
| Save member CTA | Add to plan |
| Primary CTA (to proceed) | Continue |

---

### Step 3 — Add first holding (of 3)

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
| Current value helper | Your best estimate is fine — you can update this anytime. |
| Emergency fund checkbox label | Mark as emergency fund |
| Emergency fund checkbox helper | Check this if this holding serves as your household's emergency reserve. |
| Primary CTA | See my plan |

---

### Consent modal (shown once, before Step 1)

| Element | Copy |
|---|---|
| Headline | "Before we begin" |
| Body | "This tool helps you track and understand your household's financial picture. It does not constitute financial advice. For advice tailored to your situation, consult a SEBI-registered financial advisor." |
| Primary CTA | I understand — continue |

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

### Nudge (single — first unmet check in order)

| Element | Copy |
|---|---|
| Section header | Next step |

**Check 1 — Member without holdings:**
| Nudge body | "[Member name] has no holdings recorded yet. Every member in your plan should have at least one investment or asset mapped." |
| Nudge CTA | Add a holding for [member name] → |

**Check 2 — No emergency fund:**
| Nudge body | "Your household has no emergency fund on record. This is the first safety net any plan needs — before any other investment." |
| Nudge CTA | Learn about emergency funds → |

**Check 3 — Parent without protection:**
| Nudge body | "[Member name] has no protection cover on record. Term life cover is the foundation of a household financial plan — everything else builds on it." |
| Nudge CTA | Learn about term insurance → |

**Check 4 — Fewer than 3 asset classes:**
| Nudge body | "Your household's investments are concentrated in [N] asset class[es]. A well-rounded plan typically spans at least three different types." |
| Nudge CTA | Explore asset classes → |

**Check 5 — Stale/missing current values:**
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
| Rate staleness note | "Rate as of [date]. Verify before investing — government rates change quarterly." |
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

## Empty States — Global Pattern

Every empty state follows: **[What's missing]. [Why it matters in one sentence]. [Single CTA to fix it.]**

No "No data found." No "Nothing here yet!" No exclamation marks on empty states.

---

## Error States — Global Pattern

| Scenario | Copy |
|---|---|
| Network error on data fetch | "Couldn't load your data. Check your connection and try again." + Retry button |
| Save failed | "Something went wrong saving this. Your information hasn't changed." + Try again button |
| Form validation (required field) | "This field is required." |
| Form validation (invalid number) | "Enter a valid amount in rupees." |
| Auth session expired | "Your session has ended. Sign in to continue." + Sign in button |
