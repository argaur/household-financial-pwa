export interface HealthResult {
  status: 'ok'
  version: string
  commit_sha: string
  db: 'ok' | 'error'
}

/**
 * Pure health-check logic, separated from the Hono route so it's testable
 * without spinning up a real Neon connection.
 */
export async function computeHealth(
  ping: () => Promise<unknown>,
  env: { npm_package_version?: string; commit_sha?: string } = {},
): Promise<HealthResult> {
  let dbStatus: 'ok' | 'error' = 'ok'
  try {
    await ping()
  } catch {
    dbStatus = 'error'
  }

  return {
    status: 'ok',
    version: env.npm_package_version ?? '0.0.0',
    commit_sha: env.commit_sha ?? 'dev',
    db: dbStatus,
  }
}
