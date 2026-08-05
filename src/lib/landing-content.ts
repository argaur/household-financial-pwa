/**
 * Content for the public landing page — the signed-out front door at `/`.
 *
 * Data-only; src/pages/Landing.tsx lays it out. Edit copy here.
 *
 * Two rules govern this file:
 *
 * 1. The privacy section reuses PRIVACY_CLAIM.headline from privacy-note.ts
 *    verbatim. The landing page and /privacy must make the same claim in the
 *    same words — Landing.test.tsx pins the equality. The landing page says
 *    the strong version of the claim; the limits live one click away on
 *    /privacy, never softened here and never oversold (D-014). Overclaiming
 *    on this page would cost more than saying nothing.
 *
 * 2. Voice is the copy deck's: a CFP speaking plainly to a new client. No
 *    exclamation marks, no "unlock", no "powerful insights", no jargon
 *    without a definition beside it.
 */
import { PRIVACY_CLAIM } from './privacy-note'

export const LANDING_HERO = {
  label: 'Household Financial Planning',
  headline: "Your family's money, on one page.",
  body:
    'Learn what you can invest in. Record what each member of your household holds. See the gaps in your plan, laid out the way a financial planner would.',
  primaryCta: 'Create your plan',
  secondaryCta: 'Sign in',
  browseFirst: 'Or browse the instrument library first. No account needed.',
} as const

export interface LandingStep {
  step: string
  heading: string
  body: string
}

export const HOW_IT_WORKS: readonly LandingStep[] = [
  {
    step: 'Step 1',
    heading: 'Learn what exists',
    body:
      '30 instruments across 6 asset classes, explained plainly. From PPF and Sukanya Samriddhi to index funds and sovereign gold bonds. Every term is defined where it first appears.',
  },
  {
    step: 'Step 2',
    heading: 'Record what you hold',
    body:
      'Every family member, every holding. Mutual funds, fixed deposits, gold, insurance. Your best estimate is fine. You can update it any time.',
  },
  {
    step: 'Step 3',
    heading: 'See the household picture',
    body:
      'Where the money lives across asset classes. A five-check health score. One next step at a time, not thirty.',
  },
] as const

export const LANDING_PRIVACY = {
  label: 'Privacy',
  headline: PRIVACY_CLAIM.headline,
  body:
    'Everything your family records is encrypted in your browser before it is sent. That includes names, amounts and dates of birth. Our server stores unreadable text and a key that is locked with your passphrase. The passphrase never leaves your device. There is no admin view of your holdings, because there is nothing readable to view.',
  cost:
    'That claim has a cost: if you lose both your passphrase and your recovery code, your data is gone. We cannot reset what we cannot read.',
  limitLead: 'It also has limits, and we publish them rather than hoping you assume otherwise.',
  limitLink: 'What we can and cannot see',
} as const

export interface LandingLink {
  to: string
  title: string
  description: string
}

export const SEE_IT_FIRST = {
  label: 'Before you sign up',
  heading: 'See it before you commit',
  body: 'These pages are public and need no account.',
  links: [
    {
      to: '/explore',
      title: 'The instrument library',
      description: '30 instruments across 6 asset classes, explained plainly.',
    },
    {
      to: '/why',
      title: 'How this was built',
      description: 'Every product and engineering decision, against the alternative it beat.',
    },
  ] as readonly LandingLink[],
} as const

export const NOT_ADVICE = {
  label: 'What this is not',
  body:
    'This is education, not advice. It explains instruments and shows your household’s picture; it does not recommend products, execute trades, or track live prices. For advice tailored to your situation, consult a SEBI-registered financial advisor.',
} as const
