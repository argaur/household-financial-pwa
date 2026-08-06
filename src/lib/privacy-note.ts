/**
 * Content for the public privacy note (D-014, step 13).
 *
 * Data-only; src/pages/Privacy.tsx lays it out. Edit copy here.
 *
 * This file is held to a different standard than the rest of the copy deck.
 * "We cannot read your data" is the product's main claim, and a claim like that
 * is only worth making if its limits are published next to it. Every limit
 * below is deliberate and was accepted with the design — none of it is a
 * disclaimer bolted on afterwards. Softening any of it means the claim stops
 * being true, so src/pages/Privacy.test.tsx asserts these points are present.
 */

/** The claim, and immediately the boundary of the claim. */
export const PRIVACY_CLAIM = {
  headline: 'We cannot read your data',
  body:
    'Your household details, amounts, names and dates of birth are encrypted in your browser before they are sent. What reaches our database is a block of unreadable text and a key that has been locked with your passphrase. We have no way to open it.',
  limit:
    'That is not the same as saying this is impossible to break. We serve you the code that does the encrypting, so a bad version of this app could take your key as you type it. The Proton and Bitwarden web apps share exactly this limit. It is the honest boundary of the claim, and we would rather write it down than let you assume otherwise.',
} as const

/**
 * What the server can still see. Stated in full and without softening: a
 * partial list would be worse than none, because it would read as complete.
 */
export const WHAT_THE_SERVER_STILL_LEARNS: readonly string[] = [
  'How many holdings, family members and protection records your household has.',
  'When each record was created and last changed.',
  'Which household is active, and how often it is used.',
  'Your email address and how you signed in, because that is how we let you back in.',
]

/**
 * What is deliberately NOT leaked, and why — otherwise a reader assumes the
 * list above is the whole story and stops there.
 */
export const WHAT_IS_NOT_LEAKED: readonly string[] = [
  'The size of any record. Everything is padded to a fixed block before it is encrypted, so a long note and a short one look identical on the wire.',
  'Which instrument a holding is. That is matched up in your browser against the public library, not on the server.',
  'Anything in our analytics. It counts that a holding was added; it is not told the asset class, the amount, or your plan score.',
]

export const XSS_LIMIT = {
  heading: 'The one thing encryption here does not stop',
  body:
    'Your key is marked so that no script can copy it out of the browser. That does not stop a script running on this site from asking the key to decrypt something while you are signed in. A strict content policy and an automatic lock after 15 minutes of inactivity narrow that window. They do not close it, and no browser encryption scheme does.',
} as const

export const LOST_PASSPHRASE = {
  heading: 'If you lose your passphrase',
  body:
    'Your recovery code is the second way in, and it is shown once at setup. If both are gone, your data is gone. We hold no copy of either, so there is nothing for us to reset. This is the cost of the claim at the top of this page, and it is the reason the Profile screen offers a download of everything in readable form. Take one.',
} as const
