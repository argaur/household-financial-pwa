import { describe, it, expect, vi } from 'vitest'
import { computeHealth } from './health.js'

describe('computeHealth', () => {
  it('reports db ok when the ping succeeds', async () => {
    const result = await computeHealth(vi.fn().mockResolvedValue(undefined), {
      npm_package_version: '1.2.3',
      commit_sha: 'abc123',
    })
    expect(result).toEqual({ status: 'ok', version: '1.2.3', commit_sha: 'abc123', db: 'ok' })
  })

  it('reports db error when the ping throws, without failing the health check itself', async () => {
    const result = await computeHealth(vi.fn().mockRejectedValue(new Error('connection refused')))
    expect(result.status).toBe('ok')
    expect(result.db).toBe('error')
  })

  it('defaults version and commit_sha when env values are missing', async () => {
    const result = await computeHealth(vi.fn().mockResolvedValue(undefined))
    expect(result.version).toBe('0.0.0')
    expect(result.commit_sha).toBe('dev')
  })
})
