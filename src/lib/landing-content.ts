/**
 * Content for the public landing page, the signed-out front door at `/`.
 *
 * Data-only; src/pages/Landing.tsx lays it out. Edit copy here.
 *
 * Two rules govern this file:
 *
 * 1. The privacy section reuses PRIVACY_CLAIM.headline from privacy-note.ts
 *    verbatim. The landing page and /privacy must make the same claim in the
 *    same words. Landing.test.tsx pins the equality. The landing page says
 *    the strong version of the claim; the limits live one click away on
 *    /privacy, never softened here and never oversold (D-014). Overclaiming
 *    on this page would cost more than saying nothing.
 *
 * 2. Voice is the copy deck's: a CFP speaking plainly to a new client. No
 *    exclamation marks, no "unlock", no "powerful insights", no jargon
 *    without a definition beside it. Zero em-dashes, zero en-dashes.
 */
import { PRIVACY_CLAIM } from './privacy-note'

export const LANDING_HERO = {
  // Named once in the hero, in plain words, for a visitor who has never seen
  // the header wordmark before and would otherwise skip past an unfamiliar
  // word with no explanation.
  brandName: 'Vittam',
  brandMeaning: 'Sanskrit for wealth.',
  brandRelevance: 'A name for everything your household owns. Not just what sits in one investing app.',
  label: 'For Indian households',
  // Split into three parts so the middle clause can be set in the primary
  // mint color for emphasis (the display serif has one weight, so emphasis is
  // color, never faked bold). headlineBefore + headlineEmphasis + headlineAfter
  // must concatenate to exactly headline.
  headlineBefore: 'See your ',
  headlineEmphasis: "family's money",
  headlineAfter: ' on one page.',
  headline: "See your family's money on one page.",
  body: 'Record what every member of your household holds, in one place. See the gaps in your plan, laid out the way a financial planner would.',
  primaryCta: 'Create your plan',
  secondaryCta: 'Sign in',
  audience: 'This is built for Indian households making a long term plan, not for day traders watching charts.',
} as const

export const LANDING_TRUST = {
  items: ['Free', 'Built in India', 'Encrypted on your device, so we cannot read it.'] as const,
} as const

export interface LandingProblemBeat {
  heading: string
  body: string
}

export const LANDING_PROBLEM: readonly LandingProblemBeat[] = [
  {
    heading: 'Your money is scattered',
    body: 'Mutual funds, gold, fixed deposits and paper records live in different places. Nothing connects them.',
  },
  {
    heading: 'No household view',
    body: 'Every app shows one person and one product. None show what your whole household actually owns.',
  },
  {
    heading: 'Advice that ignores what you own',
    body: "Generic advice does not know your family's accounts, gold or insurance. It just guesses.",
  },
] as const

export interface LandingFigure {
  value: string
  label: string
}

export const LANDING_FIGURES: readonly LandingFigure[] = [
  { value: '30', label: 'Instruments explained' },
  { value: '6', label: 'Asset classes covered' },
  { value: '5', label: 'Health checks run' },
  { value: '0', label: 'Of your data we can read' },
] as const

export interface LandingStep {
  step: string
  heading: string
  body: string
}

export const HOW_IT_WORKS: readonly LandingStep[] = [
  {
    step: 'Step 1',
    heading: 'Learn what exists',
    body: '30 instruments across 6 asset classes, explained plainly. From PPF and Sukanya Samriddhi to index funds and sovereign gold bonds. Every term is defined where it first appears.',
  },
  {
    step: 'Step 2',
    heading: 'Record what you hold',
    body: 'Every family member, every holding. Mutual funds, fixed deposits, gold, insurance. Your best estimate is fine. You can update it any time.',
  },
  {
    step: 'Step 3',
    heading: 'See the household picture',
    body: 'Where the money lives across asset classes. A five-check health score. One next step at a time, not thirty.',
  },
] as const

export const LANDING_PRIVACY = {
  label: 'Privacy',
  headline: PRIVACY_CLAIM.headline,
  body: 'Everything your family records is encrypted in your browser before it is sent. That includes names, amounts and dates of birth. Our server stores unreadable text and a key that is locked with your passphrase. The passphrase never leaves your device. There is no admin view of your holdings, because there is nothing readable to view.',
  cost: 'That claim has a cost: if you lose both your passphrase and your recovery code, your data is gone. We cannot reset what we cannot read.',
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
  heading: 'See it first',
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

export interface LandingBuiltDecision {
  heading: string
  instead: string
}

export const LANDING_BUILT: readonly LandingBuiltDecision[] = [
  {
    heading: 'It never tells you to buy.',
    instead: 'personalized recommendations telling you what to invest in.',
  },
  {
    heading: "You cannot ask for another household's data.",
    instead: 'trusting an ID your browser sends, instead of checking who is signed in.',
  },
  {
    heading: 'Offline reading, with an honest limit.',
    instead: 'claiming a full offline dashboard that would not actually work.',
  },
] as const

export const NOT_ADVICE = {
  label: 'What this is not',
  body: "This is education, not advice. It explains instruments and shows your household's picture; it does not recommend products, execute trades, or track live prices. For advice tailored to your situation, consult a SEBI-registered financial advisor.",
} as const

export const LANDING_CREDIT = 'Built solo by Gaurav Gupta.'
