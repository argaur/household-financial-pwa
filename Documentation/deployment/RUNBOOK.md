# Runbook — [Project Name]

**Audience:** You, during an incident, possibly at 2am. Exact commands only — no "hopeful paragraphs."

---

## Deploy

```
[exact commands / platform steps]
```

## Rollback (proven, timed)

```
[exact commands to roll back to prior version]
```

**Rollback rehearsal:** executed on YYYY-MM-DD, took [N] minutes, verified by [what you checked]. Mandatory on first deploy — the first rollback must not happen during an incident.

## Logs

| What | Where | Command/URL |
|---|---|---|
| App logs | | |
| Error tracking | Sentry | |
| Analytics | PostHog | |

## Database

- Access: `[exact command]`
- Backups: [cadence, location, how to restore — restore tested? Y/N]
- Migrations: apply `[cmd]` / revert `[cmd]`

## Rotate a Secret

1. [Where secrets live]
2. [Rotation steps]
3. [Redeploy/restart needed?]

## Common Failure Playbook

| Symptom | Likely cause | First action |
|---|---|---|
| /health down | | |
| Error spike in Sentry | | |
| Events missing in PostHog | | |
| [Project-specific] | | |
