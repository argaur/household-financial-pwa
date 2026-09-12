/**
 * D-025 step I12 — SPEC.md §I6.5: "No parsed row reaches persistent storage.
 * Assertion by test: after a parse, `localStorage`, `sessionStorage`, and
 * IndexedDB contain no value matching any fixture amount."
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS SHAPED THE WAY IT IS
 *
 * An absence proof is worth exactly as much as (a) the enumeration of the
 * places it looked and (b) the distinctiveness of what it looked for. A test
 * that checks two storage APIs for one round number proves close to nothing
 * while reading as authoritative, so both halves are made explicit here.
 *
 * (a) THE ENUMERATION. `scanPersistenceSurfaces()` below is the whole list of
 *     places a browser lets a page put something, each one dumped rather than
 *     spot-checked:
 *
 *       localStorage      every key and value
 *       sessionStorage    every key and value
 *       IndexedDB         every database (`databases()`, plus the two this app
 *                         is known to open, in case an implementation
 *                         under-reports), every object store in each, every
 *                         key and every value, walked recursively
 *       Cache Storage     via a recording `caches` shim installed for the run
 *                         (jsdom ships none), which captures anything the code
 *                         under test would have written to a cache
 *       cookies           `document.cookie`
 *       window.name       the one in-page string that genuinely survives a
 *                         cross-document navigation in the same tab
 *       history.state     survives back/forward and is serialised to disk by
 *                         the session store
 *       location.href     a value pushed into the URL is persisted by history
 *                         and by the address bar
 *
 *     Ruled out, with the reason rather than by omission:
 *
 *       Module-level JS caches — a module-scope `Map`/array does NOT survive a
 *         navigation: a real page load discards the entire module registry
 *         along with the heap. It survives only a client-side route change,
 *         which is not persistence. The reachable part of it is still checked:
 *         every exported binding of all five plaintext-bearing import modules
 *         is serialised and scanned after the flow (`scanModuleExports()`),
 *         which would catch a memo, a `const CACHE = new Map()`, or a
 *         module-level array of parsed rows.
 *       The real service worker — there is no service worker in jsdom, so what
 *         Workbox would cache cannot be exercised here at all. That surface is
 *         pinned separately and structurally by `sw-cache-policy.test.ts`
 *         (§I6.6: no `/api/*` request or response body is cached) and
 *         `spreadsheet-parser-pwa.config.test.ts`. The shim below covers the
 *         different question of whether *page* code calls `caches.put`.
 *       The network — not persistent storage, but it is the one place a parsed
 *         row legitimately leaves memory, so the batch POST's raw body is
 *         scanned too. It must carry ciphertext and ids only.
 *       The DOM — the review screen renders member names and amounts on
 *         purpose; that is the feature, and it dies with the tab.
 *       Origin Private File System / `showSaveFilePicker` / WebSQL — no API in
 *         this app touches any of them (`grep` over `src/` finds no
 *         `navigator.storage.getDirectory`, `showSaveFilePicker` or
 *         `openDatabase`), and jsdom implements none, so there is nothing to
 *         look at.
 *
 * (b) THE NEEDLES. Every fixture value below is chosen so that a match cannot
 *     plausibly be a coincidence: eight- and nine-digit non-round amounts, and
 *     invented names and note strings that appear nowhere else in the repo.
 *     `150000` — the kind of round number a seeded instrument blurb or an
 *     unrelated fixture could carry by accident — is deliberately not used.
 *     Each needle is checked as a SUBSTRING, and compound needles are checked
 *     by their parts as well, because a partial leak is still a leak.
 *
 * (c) THE SCANNER IS ITSELF TESTED. The last describe block plants a needle
 *     into every surface in turn and asserts the scanner reports it, so a
 *     green absence result here cannot be the scanner quietly looking at
 *     nothing. That block is the permanent form of the manual experiment this
 *     step required.
 * ---------------------------------------------------------------------------
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createElement } from 'react'

import { bucketImportRows, type BucketedRows, type RawImportRow } from './import-bucketing'
import * as importBucketingModule from './import-bucketing'
import * as importParserModule from './import-parser'
import * as importRejectsModule from './import-rejects'
import * as importTemplateModule from './import-template'
import * as importCommitModule from './import-commit'
import { buildRejectsWorkbook, buildRejectsFilename } from './import-rejects'
import { commitImportBatch } from './import-commit'
import { ImportReviewScreen } from '@/components/import-review-screen'
import type { Instrument } from './instruments-api'
import type { Holding } from './holdings-api'
import type { TemplateMember } from './import-template'
import { unlockTestVault, jsonResponse } from '@/test/encrypted-fixtures'

// ---------------------------------------------------------------------------
// Fixtures — values that cannot occur by chance
// ---------------------------------------------------------------------------

const MEMBER: TemplateMember = { id: 'member-zephyrina', name: 'Zephyrina Quillsworth' }
const LEDGER_NAME = 'Quixotry Reserve'

/** Indian-grouped text in the cell; 74631829 after `parseAmountCell`. Both forms are needles. */
const READY_INVESTED_TEXT = '7,46,31,829'
const READY_INVESTED_NUMBER = '74631829'
const READY_CURRENT = 93847162
const READY_UNITS = 58392617
const READY_SIP = 4172639
const READY_START_DATE = '2031-07-19'
const READY_NOMINEE = 'Thaddeus Mooncastle'
const READY_NOTES = 'blueprint-okapi-verandah-17714'

const ATTENTION_SHORTHAND = '9.37L'
const ATTENTION_NOTES = 'granular-zither-88231'

const DUPLICATE_INVESTED = 61728394
const DUPLICATE_NOMINEE = 'Persimmon Underhay'

/**
 * Every string a leak would have to contain, whole or in part. Compound values
 * are listed by their parts too: half a name or half a note in a storage slot
 * is still a leak, and a scanner that only looks for the whole string would
 * report clean.
 */
const NEEDLES: readonly string[] = [
  // Member name
  'Zephyrina Quillsworth',
  'Zephyrina',
  'Quillsworth',
  // Ledger name
  'Quixotry Reserve',
  'Quixotry',
  // Nominees
  READY_NOMINEE,
  'Thaddeus',
  'Mooncastle',
  DUPLICATE_NOMINEE,
  'Persimmon',
  'Underhay',
  // Notes
  READY_NOTES,
  'okapi-verandah',
  '17714',
  ATTENTION_NOTES,
  'zither',
  '88231',
  // Amounts, in both the raw cell form and the parsed form
  READY_INVESTED_TEXT,
  READY_INVESTED_NUMBER,
  String(READY_CURRENT),
  String(READY_UNITS),
  String(READY_SIP),
  String(DUPLICATE_INVESTED),
  ATTENTION_SHORTHAND,
  // Dates
  READY_START_DATE,
]

function makeInstrument(slug: string, name: string, category: number): Instrument {
  return {
    id: slug,
    slug,
    name,
    category,
    summary: '',
    returns: '',
    tax: '',
    liquidity: '',
    risk: '',
    eligibility: '',
    minInvestment: '',
    rateValue: null,
    rateAsOf: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const INSTRUMENT_READY = makeInstrument('equity-nifty-50-index-fund', 'Nifty 50 Index Fund', 1)
const INSTRUMENT_ATTENTION = makeInstrument('equity-flexi-cap-fund', 'Flexi Cap Fund', 1)
const INSTRUMENT_DUPLICATE = makeInstrument('equity-mid-cap-fund', 'Mid Cap Fund', 1)
const INSTRUMENT_SKIPPED = makeInstrument('equity-small-cap-fund', 'Small Cap Fund', 1)

const INSTRUMENTS = [INSTRUMENT_READY, INSTRUMENT_ATTENTION, INSTRUMENT_DUPLICATE, INSTRUMENT_SKIPPED]

function blankRow(rowNumber: number, instrument: Instrument): RawImportRow {
  return {
    member: MEMBER,
    rowNumber,
    slug: instrument.slug,
    instrumentName: instrument.name,
    investedAmount: null,
    currentValue: null,
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    emergencyFund: false,
    notes: null,
  }
}

/** One raw upload: one row in each of the four buckets, all carrying needles where a bucket allows it. */
function rawRows(): RawImportRow[] {
  return [
    {
      ...blankRow(2, INSTRUMENT_READY),
      investedAmount: READY_INVESTED_TEXT,
      currentValue: READY_CURRENT,
      units: READY_UNITS,
      monthlySip: READY_SIP,
      startDate: READY_START_DATE,
      nominee: READY_NOMINEE,
      notes: READY_NOTES,
    },
    {
      ...blankRow(3, INSTRUMENT_ATTENTION),
      investedAmount: ATTENTION_SHORTHAND, // shorthand -> rejected, never guessed (§I6.10)
      currentValue: 12345678,
      notes: ATTENTION_NOTES,
    },
    {
      ...blankRow(4, INSTRUMENT_DUPLICATE),
      investedAmount: DUPLICATE_INVESTED,
      currentValue: DUPLICATE_INVESTED,
      nominee: DUPLICATE_NOMINEE,
    },
    blankRow(5, INSTRUMENT_SKIPPED), // untouched template row
  ]
}

const EXISTING_HOLDINGS: Holding[] = [
  {
    id: 'holding-existing',
    householdId: 'household-1',
    memberId: MEMBER.id,
    instrumentId: INSTRUMENT_DUPLICATE.id,
    assetClass: 'equity',
    investedAmount: '1',
    currentValue: '1',
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    isEmergencyFund: false,
    notes: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

// ---------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------

const KNOWN_IDB_DATABASES = ['fp-vault', 'fp-key-setup'] as const

function bytesToText(bytes: Uint8Array): string {
  let latin1 = ''
  for (const byte of bytes) latin1 += String.fromCharCode(byte)
  let utf8 = ''
  try {
    utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    utf8 = ''
  }
  return `${latin1}\u0000${utf8}`
}

/**
 * Everything a value could be hiding, flattened to text. Walks recursively and
 * decodes binary both ways, so a needle cannot escape by being inside a
 * `Uint8Array`, a `Map`, a nested object or an `ArrayBuffer`.
 */
function serialize(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || value === undefined) return String(value)
  const type = typeof value
  if (type === 'string') return value as string
  if (type === 'number' || type === 'boolean' || type === 'bigint' || type === 'symbol') return String(value)
  if (type === 'function') return (value as () => unknown).toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof ArrayBuffer) return bytesToText(new Uint8Array(value))
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return bytesToText(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  }
  const object = value as object
  if (seen.has(object)) return '[circular]'
  seen.add(object)
  if (Array.isArray(value)) return value.map((entry) => serialize(entry, seen)).join('\u0000')
  if (value instanceof Map) {
    return [...value.entries()].map(([k, v]) => `${serialize(k, seen)}=${serialize(v, seen)}`).join('\u0000')
  }
  if (value instanceof Set) return [...value].map((entry) => serialize(entry, seen)).join('\u0000')
  const tag = Object.prototype.toString.call(value)
  const own = Object.keys(object).map((key) => `${key}=${serialize((object as Record<string, unknown>)[key], seen)}`)
  return `${tag}{${own.join('\u0000')}}`
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error(`blocked opening ${name}`))
  })
}

async function dumpIndexedDb(): Promise<string> {
  const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB
  if (!factory) return 'indexeddb:unavailable'

  const names = new Set<string>(KNOWN_IDB_DATABASES)
  if (typeof factory.databases === 'function') {
    for (const entry of await factory.databases()) {
      if (entry.name) names.add(entry.name)
    }
  }

  const lines: string[] = []
  for (const name of names) {
    const db = await openDatabase(factory, name)
    try {
      const storeNames = Array.from(db.objectStoreNames)
      if (storeNames.length === 0) {
        lines.push(`idb:${name} (no object stores)`)
        continue
      }
      const tx = db.transaction(storeNames, 'readonly')
      for (const storeName of storeNames) {
        const store = tx.objectStore(storeName)
        const keys = await requestToPromise(store.getAllKeys())
        const values = await requestToPromise(store.getAll())
        lines.push(`idb:${name}/${storeName} keys=${serialize(keys)} values=${serialize(values)}`)
      }
    } finally {
      db.close()
    }
  }
  return lines.join('\n')
}

/** Records anything written through `caches`, which jsdom does not implement at all. */
interface RecordedCacheWrite {
  cacheName: string
  request: string
  body: string
}

const cacheWrites: RecordedCacheWrite[] = []

function installRecordingCacheStorage(): void {
  const makeCache = (cacheName: string) => {
    const record = async (request: unknown, response?: unknown) => {
      let body = ''
      if (response instanceof Response) {
        body = await response.clone().text()
      } else if (response !== undefined) {
        body = serialize(response)
      }
      const url =
        request instanceof Request ? request.url : typeof request === 'string' ? request : serialize(request)
      cacheWrites.push({ cacheName, request: url, body })
    }
    return {
      put: (request: unknown, response: unknown) => record(request, response),
      add: (request: unknown) => record(request),
      addAll: async (requests: unknown[]) => {
        for (const request of requests) await record(request)
      },
      match: async () => undefined,
      matchAll: async () => [],
      keys: async () => [],
      delete: async () => false,
    }
  }
  const store = new Map<string, ReturnType<typeof makeCache>>()
  vi.stubGlobal('caches', {
    open: async (cacheName: string) => {
      const existing = store.get(cacheName)
      if (existing) return existing
      const created = makeCache(cacheName)
      store.set(cacheName, created)
      return created
    },
    has: async (cacheName: string) => store.has(cacheName),
    keys: async () => [...store.keys()],
    delete: async (cacheName: string) => store.delete(cacheName),
    match: async () => undefined,
  })
}

function dumpWebStorage(storage: Storage, label: string): string {
  const lines: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key === null) continue
    lines.push(`${label}:${key}=${storage.getItem(key) ?? ''}`)
  }
  return lines.join('\n')
}

/**
 * Every exported binding of every plaintext-bearing import module, serialised.
 * Catches a module-level memo or accumulator that held onto parsed rows — the
 * reachable half of the "in-memory cache" surface (see the file header for why
 * the unreachable half is not persistence).
 */
function scanModuleExports(): string {
  const modules: Array<[string, Record<string, unknown>]> = [
    ['import-parser', importParserModule as unknown as Record<string, unknown>],
    ['import-bucketing', importBucketingModule as unknown as Record<string, unknown>],
    ['import-rejects', importRejectsModule as unknown as Record<string, unknown>],
    ['import-template', importTemplateModule as unknown as Record<string, unknown>],
    ['import-commit', importCommitModule as unknown as Record<string, unknown>],
  ]
  return modules
    .map(([name, mod]) =>
      Object.keys(mod)
        .map((key) => `module:${name}.${key}=${serialize(mod[key])}`)
        .join('\n'),
    )
    .join('\n')
}

interface SurfaceDump {
  localStorage: string
  sessionStorage: string
  indexedDB: string
  cacheStorage: string
  cookies: string
  windowName: string
  historyState: string
  locationHref: string
}

async function scanPersistenceSurfaces(): Promise<SurfaceDump> {
  return {
    localStorage: dumpWebStorage(window.localStorage, 'localStorage'),
    sessionStorage: dumpWebStorage(window.sessionStorage, 'sessionStorage'),
    indexedDB: await dumpIndexedDb(),
    cacheStorage: serialize(cacheWrites),
    cookies: `cookie:${document.cookie}`,
    windowName: `window.name:${window.name}`,
    historyState: `history.state:${serialize(window.history.state)}`,
    locationHref: `location.href:${window.location.href}`,
  }
}

/** `[surface, needle]` for every needle found in every surface. Empty means clean. */
function findNeedles(dump: SurfaceDump): Array<[string, string]> {
  const hits: Array<[string, string]> = []
  for (const [surface, text] of Object.entries(dump)) {
    for (const needle of NEEDLES) {
      if (text.includes(needle)) hits.push([surface, needle])
    }
  }
  return hits
}

// ---------------------------------------------------------------------------
// The flow under test
// ---------------------------------------------------------------------------

/**
 * The whole plaintext lifetime, end to end: parse and bucket (I5/I7), render
 * the review screen and drive it (I8), build the rejects workbook (I9), then
 * seal and commit the Ready bucket (I11). Returns the raw body that crossed
 * the wire.
 */
async function runFullImportFlow(): Promise<{ buckets: BucketedRows; wireBody: string }> {
  const rows = rawRows()
  const buckets = bucketImportRows({ rows, instruments: INSTRUMENTS, existingHoldings: EXISTING_HOLDINGS })

  // I8 — the screen holds parsed rows in component state and renders them.
  let committed: BucketedRows['ready'] = []
  const onDownloadRejects = vi.fn()
  render(
    createElement(ImportReviewScreen, {
      buckets,
      ledgerName: LEDGER_NAME,
      onCommit: (readyRows) => {
        committed = readyRows
      },
      onLeave: () => {},
      onDownloadRejects,
    }),
  )
  // Open the collapsed buckets so every parsed row is actually rendered.
  for (const summary of Array.from(document.querySelectorAll('summary'))) {
    fireEvent.click(summary)
  }
  fireEvent.click(screen.getByRole('button', { name: /Download rejects/ }))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`Add 1 holding to ${LEDGER_NAME}`) }))
  expect(committed).toHaveLength(1)

  // I9 — the rejects workbook, built from the raw cells.
  const workbook = await buildRejectsWorkbook(rows, buckets)
  expect(workbook.SheetNames.length).toBeGreaterThan(0)
  buildRejectsFilename(LEDGER_NAME, new Date('2026-09-11T10:00:00Z'))

  // I11 — seal every Ready row and post the batch.
  const vault = await unlockTestVault('household-1')
  expect(vault.householdId).toBe('household-1')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', inserted: 1 }, 201)))
  const result = await commitImportBatch({
    token: 'test-token',
    ledgerId: 'ledger-1',
    readyRows: committed,
    instruments: INSTRUMENTS,
  })
  expect(result.inserted).toBe(1)

  const call = vi.mocked(fetch).mock.calls[0] as unknown as [unknown, RequestInit | undefined]
  return { buckets, wireBody: String(call[1]?.body) }
}

// ---------------------------------------------------------------------------

describe('SPEC.md §I6.5 — no parsed row reaches persistent storage', () => {
  beforeEach(() => {
    cacheWrites.length = 0
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.name = ''
    globalThis.indexedDB = new IDBFactory()
    installRecordingCacheStorage()
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0]?.trim()
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    }
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('leaves every browser persistence surface free of any fixture value after a full parse, review and commit', async () => {
    const { buckets } = await runFullImportFlow()

    // The flow really did carry the fixture values — an absence proof over a
    // flow that parsed nothing would be vacuous.
    expect(buckets.ready[0].resolved?.investedAmount).toBe(Number(READY_INVESTED_NUMBER))
    expect(buckets.ready[0].resolved?.nominee).toBe(READY_NOMINEE)
    expect(buckets.ready[0].resolved?.notes).toBe(READY_NOTES)
    expect(buckets.needsAttention).toHaveLength(1)
    expect(buckets.possibleDuplicate).toHaveLength(1)
    expect(buckets.skipped).toHaveLength(1)

    const dump = await scanPersistenceSurfaces()
    expect(findNeedles(dump)).toEqual([])
  })

  it('writes nothing at all to localStorage or sessionStorage during the flow', async () => {
    await runFullImportFlow()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('opens no IndexedDB database beyond the vault the commit path must read', async () => {
    await runFullImportFlow()
    const factory = globalThis.indexedDB
    const names = (await factory.databases()).map((entry) => entry.name).sort()
    // `fp-vault` is opened by `openVault` in `import-commit.ts`; it holds a
    // non-extractable CryptoKey and a household id, never a parsed row.
    expect(names).toEqual(['fp-vault'])
  })

  it('writes nothing through the Cache Storage API', async () => {
    await runFullImportFlow()
    expect(cacheWrites).toEqual([])
  })

  it('sends ciphertext, not plaintext, as the only thing that leaves memory', async () => {
    const { wireBody } = await runFullImportFlow()
    for (const needle of NEEDLES) {
      expect(wireBody, `the batch POST body leaked ${needle}`).not.toContain(needle)
    }
    const parsed = JSON.parse(wireBody) as { ledgerId: string; holdings: Array<Record<string, unknown>> }
    expect(parsed.holdings).toHaveLength(1)
    expect(Object.keys(parsed.holdings[0]).sort()).toEqual(['alg', 'ciphertext', 'id', 'iv', 'memberId'])
  })

  it('leaves no parsed row on a module-level export of any import module', async () => {
    await runFullImportFlow()
    const exported = scanModuleExports()
    for (const needle of NEEDLES) {
      expect(exported, `a module export leaked ${needle}`).not.toContain(needle)
    }
  })
})

/**
 * The scanner, tested. Each case plants one needle in one surface and asserts
 * the scan reports that surface — so the green result above cannot be the
 * scanner looking at nothing.
 */
describe('the absence scanner itself catches a planted leak', () => {
  beforeEach(() => {
    cacheWrites.length = 0
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.name = ''
    globalThis.indexedDB = new IDBFactory()
    installRecordingCacheStorage()
  })

  afterEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.name = ''
    vi.unstubAllGlobals()
  })

  it('is clean on an untouched environment', async () => {
    expect(findNeedles(await scanPersistenceSurfaces())).toEqual([])
  })

  it('catches an amount planted in localStorage', async () => {
    window.localStorage.setItem('import:draft', JSON.stringify({ investedAmount: READY_INVESTED_NUMBER }))
    expect(findNeedles(await scanPersistenceSurfaces())).toContainEqual(['localStorage', READY_INVESTED_NUMBER])
  })

  it('catches a nominee planted in sessionStorage', async () => {
    window.sessionStorage.setItem('import:rows', `nominee=${READY_NOMINEE}`)
    expect(findNeedles(await scanPersistenceSurfaces())).toContainEqual(['sessionStorage', READY_NOMINEE])
  })

  it('catches a note planted in IndexedDB, inside a nested object', async () => {
    const factory = globalThis.indexedDB
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('fp-import-draft', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('rows')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('rows', 'readwrite')
        tx.objectStore('rows').put({ row: { resolved: { notes: READY_NOTES } } }, 'active')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
    expect(findNeedles(await scanPersistenceSurfaces())).toContainEqual(['indexedDB', READY_NOTES])
  })

  it('catches a member name planted in IndexedDB as raw UTF-8 bytes', async () => {
    const factory = globalThis.indexedDB
    const bytes = new TextEncoder().encode(`member=${MEMBER.name}`)
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('fp-import-blob', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('blobs')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('blobs', 'readwrite')
        tx.objectStore('blobs').put(bytes, 'active')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
    expect(findNeedles(await scanPersistenceSurfaces())).toContainEqual(['indexedDB', MEMBER.name])
  })

  it('catches an amount planted in a Cache Storage response body', async () => {
    const cache = await caches.open('import-rows')
    await cache.put('/api/holdings-batch', new Response(JSON.stringify({ currentValue: READY_CURRENT })))
    expect(findNeedles(await scanPersistenceSurfaces())).toContainEqual(['cacheStorage', String(READY_CURRENT)])
  })

  it('catches a value planted in a cookie', async () => {
    document.cookie = `import_draft=${encodeURIComponent(READY_UNITS)}; path=/`
    expect(findNeedles(await scanPersistenceSurfaces())).toContainEqual(['cookies', String(READY_UNITS)])
    document.cookie = 'import_draft=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('catches a value planted in window.name, which survives a navigation', async () => {
    window.name = `sip=${READY_SIP}`
    expect(findNeedles(await scanPersistenceSurfaces())).toContainEqual(['windowName', String(READY_SIP)])
  })

  it('catches a value planted in history.state', async () => {
    window.history.replaceState({ draft: { nominee: DUPLICATE_NOMINEE } }, '')
    expect(findNeedles(await scanPersistenceSurfaces())).toContainEqual(['historyState', DUPLICATE_NOMINEE])
    window.history.replaceState(null, '')
  })

  it('catches a value pushed into the URL', async () => {
    window.history.replaceState(null, '', `/import?amount=${READY_INVESTED_NUMBER}`)
    expect(findNeedles(await scanPersistenceSurfaces())).toContainEqual(['locationHref', READY_INVESTED_NUMBER])
    window.history.replaceState(null, '', '/')
  })
})
