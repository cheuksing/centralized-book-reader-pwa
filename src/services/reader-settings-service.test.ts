import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReaderSettingsDocument } from '@models/database/schemas'
import { defaultReaderSettings, loadReaderSettings, saveReaderSettings } from './reader-settings-service'

const mocks = vi.hoisted(() => ({
  getReaderDatabase: vi.fn(),
}))

vi.mock('@models/database/opfs-database', () => ({
  getReaderDatabase: mocks.getReaderDatabase,
}))

type ReaderDocument = ReaderSettingsDocument & {
  toJSON: () => ReaderSettingsDocument
  patch: (changes: Partial<ReaderSettingsDocument>) => Promise<void>
}

function documentFor(value: ReaderSettingsDocument, onPatch?: (changes: Partial<ReaderSettingsDocument>) => void): ReaderDocument {
  const state = { ...value }
  const document = {
    ...state,
    toJSON: () => ({ ...state }),
    patch: async (changes: Partial<ReaderSettingsDocument>) => {
      Object.assign(state, changes)
      Object.assign(document, changes)
      onPatch?.(changes)
    },
  }
  return document
}

function settingsCollection(initial?: ReaderSettingsDocument) {
  let stored = initial ? { ...initial } : undefined
  const collection = {
    findOne: vi.fn(() => ({ exec: async () => stored ? documentFor(stored, (changes) => { stored = { ...stored!, ...changes } }) : undefined })),
    insert: vi.fn(async (value: ReaderSettingsDocument) => { stored = { ...value } }),
  }
  return {
    collection,
    get stored() { return stored },
  }
}

const validStoredSettings: ReaderSettingsDocument = {
  id: 'global',
  scope: 'global',
  ...defaultReaderSettings,
}

describe('reader settings service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates default global settings when none exist', async () => {
    const fake = settingsCollection()
    mocks.getReaderDatabase.mockResolvedValue({ readerSettings: fake.collection })

    await expect(loadReaderSettings()).resolves.toEqual(defaultReaderSettings)
    expect(fake.stored).toEqual({ id: 'global', scope: 'global', ...defaultReaderSettings })
  })

  it('normalizes stored documents to the reader settings value', async () => {
    const fake = settingsCollection({ ...validStoredSettings, publicationKey: 'stale-metadata' })
    mocks.getReaderDatabase.mockResolvedValue({ readerSettings: fake.collection })

    await expect(loadReaderSettings()).resolves.toEqual(defaultReaderSettings)
  })

  it('returns a concurrently inserted record after the first insert loses a race', async () => {
    const concurrent: ReaderSettingsDocument = {
      id: 'global',
      scope: 'global',
      theme: 'dark',
      fontSize: 22,
      lineHeight: 1.8,
      contentWidth: 'wide',
    }
    let findCount = 0
    const collection = {
      findOne: vi.fn(() => ({ exec: async () => findCount++ === 0 ? undefined : documentFor(concurrent) })),
      insert: vi.fn(async () => { throw new Error('duplicate global settings') }),
    }
    mocks.getReaderDatabase.mockResolvedValue({ readerSettings: collection })

    await expect(loadReaderSettings()).resolves.toEqual({
      theme: 'dark',
      fontSize: 22,
      lineHeight: 1.8,
      contentWidth: 'wide',
    })
  })

  it('saves existing settings and creates a missing settings document', async () => {
    const existing = settingsCollection(validStoredSettings)
    mocks.getReaderDatabase.mockResolvedValue({ readerSettings: existing.collection })
    const next = { ...defaultReaderSettings, theme: 'dark' as const, fontSize: 20 }

    await saveReaderSettings(next)
    expect(existing.stored).toMatchObject(next)

    const missing = settingsCollection()
    mocks.getReaderDatabase.mockResolvedValue({ readerSettings: missing.collection })
    await saveReaderSettings(next)
    expect(missing.stored).toEqual({ id: 'global', scope: 'global', ...next })
  })

  it('preserves save failures from patch and insert operations', async () => {
    const patchFailure = new Error('settings patch failed')
    const existingDocument = documentFor(validStoredSettings, () => { throw patchFailure })
    const patchCollection = {
      findOne: vi.fn(() => ({ exec: async () => existingDocument })),
      insert: vi.fn(),
    }
    mocks.getReaderDatabase.mockResolvedValue({ readerSettings: patchCollection })
    await expect(saveReaderSettings(defaultReaderSettings)).rejects.toBe(patchFailure)

    const insertFailure = new Error('settings insert failed')
    const insertCollection = {
      findOne: vi.fn(() => ({ exec: async () => undefined })),
      insert: vi.fn(async () => { throw insertFailure }),
    }
    mocks.getReaderDatabase.mockResolvedValue({ readerSettings: insertCollection })
    await expect(saveReaderSettings(defaultReaderSettings)).rejects.toBe(insertFailure)
  })
})
