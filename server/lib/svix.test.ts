import { describe, it, expect } from 'vitest'
import { verifySvixSignature } from './svix.js'

// Test secret in the same shape Clerk issues (whsec_<base64>) — synthetic,
// never a real webhook secret. Signature generated the same way
// verifySvixSignature computes it, via the same Web Crypto primitives, so
// this test exercises the real HMAC/base64/comparison path end-to-end
// rather than mocking crypto.subtle.
const TEST_SECRET = 'whsec_MfKQ9r8GxxWCsnrRVDU4vNyBqXPFA5HWtNq7hMt3cVA='

async function sign(body: string, id: string, timestamp: string): Promise<string> {
  const secretBytes = Uint8Array.from(atob(TEST_SECRET.replace('whsec_', '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signedContent = `${id}.${timestamp}.${body}`
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const sigBytes = new Uint8Array(sigBuffer)
  let binary = ''
  for (const byte of sigBytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

describe('verifySvixSignature', () => {
  const body = JSON.stringify({ type: 'user.deleted', data: { id: 'user_123' } })
  const id = 'msg_test123'

  it('accepts a correctly signed, fresh payload', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const sig = await sign(body, id, timestamp)
    const ok = await verifySvixSignature(
      body,
      { svixId: id, svixTimestamp: timestamp, svixSignature: `v1,${sig}` },
      TEST_SECRET,
    )
    expect(ok).toBe(true)
  })

  it('accepts when the signature header has multiple space-separated versions', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const sig = await sign(body, id, timestamp)
    const ok = await verifySvixSignature(
      body,
      { svixId: id, svixTimestamp: timestamp, svixSignature: `v0,garbage v1,${sig}` },
      TEST_SECRET,
    )
    expect(ok).toBe(true)
  })

  it('rejects a tampered body', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const sig = await sign(body, id, timestamp)
    const tamperedBody = JSON.stringify({ type: 'user.deleted', data: { id: 'user_attacker' } })
    const ok = await verifySvixSignature(
      tamperedBody,
      { svixId: id, svixTimestamp: timestamp, svixSignature: `v1,${sig}` },
      TEST_SECRET,
    )
    expect(ok).toBe(false)
  })

  it('rejects a signature computed with the wrong secret', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const wrongSecret = 'whsec_ZmFrZS1zZWNyZXQtZm9yLXRlc3Rpbmctb25seQ=='
    const wrongSecretBytes = Uint8Array.from(atob(wrongSecret.replace('whsec_', '')), (c) => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', wrongSecretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`))
    let binary = ''
    for (const byte of new Uint8Array(sigBuffer)) binary += String.fromCharCode(byte)
    const wrongSig = btoa(binary)

    const ok = await verifySvixSignature(
      body,
      { svixId: id, svixTimestamp: timestamp, svixSignature: `v1,${wrongSig}` },
      TEST_SECRET,
    )
    expect(ok).toBe(false)
  })

  it('rejects a stale timestamp outside the replay-tolerance window', async () => {
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600) // 1 hour old
    const sig = await sign(body, id, staleTimestamp)
    const ok = await verifySvixSignature(
      body,
      { svixId: id, svixTimestamp: staleTimestamp, svixSignature: `v1,${sig}` },
      TEST_SECRET,
    )
    expect(ok).toBe(false)
  })

  it('rejects when a required header is missing', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const sig = await sign(body, id, timestamp)
    const ok = await verifySvixSignature(body, { svixId: null, svixTimestamp: timestamp, svixSignature: `v1,${sig}` }, TEST_SECRET)
    expect(ok).toBe(false)
  })
})
