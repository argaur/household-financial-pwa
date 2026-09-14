import { describe, it, expect } from 'vitest'
import { VaultLockedError } from './encrypted-rows'
import { classifyLoadFailure } from './vault-lock'

describe('classifyLoadFailure', () => {
  it('calls a locked vault locked', () => {
    expect(classifyLoadFailure(new VaultLockedError())).toBe('locked')
  })

  it('calls everything else an error', () => {
    // A network failure, a 500, a bad payload: all of these genuinely are
    // "something went wrong, try again", and must not borrow the unlock copy.
    expect(classifyLoadFailure(new Error('network'))).toBe('error')
    expect(classifyLoadFailure(new TypeError('boom'))).toBe('error')
    expect(classifyLoadFailure('not an error at all')).toBe('error')
    expect(classifyLoadFailure(undefined)).toBe('error')
  })

  it('does not match on the name alone, so a look-alike cannot borrow the unlock screen', () => {
    const impostor = new Error('locked')
    impostor.name = 'VaultLockedError'
    expect(classifyLoadFailure(impostor)).toBe('error')
  })
})
