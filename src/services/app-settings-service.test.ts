import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettingsDocument } from '@models/database/schemas'

const mocks = vi.hoisted(() => ({
  getReaderDatabase: vi.fn(),
}))

vi.mock('@models/database/opfs-database', () => ({
  getReaderDatabase: mocks.getReaderDatabase,
}))

import { loadAppSettings, savePersistenceResult } from './app-settings-service'

function documentFor(value: AppSettingsDocument, onPatch?: (changes: Partial<AppSettingsDocument>) => void) {
  const state = { ...value }
  return {
    toJSON: () => ({ ...state }),
    patch: async (changes: Partial<AppSettingsDocument>) => {
      Object.assign(state, changes)
      onPatch?.(changes)
    },
  }
}

function appCollection(initial?: AppSettingsDocument) {
  let stored = initial ? { ...initial } : undefined
  const collection = {
    findOne: vi.fn(() => ({ exec: async () => stored ? documentFor(stored, (changes) => { stored = { ...stored!, ...changes } }) : undefined })),
    insert: vi.fn(async (value: AppSettingsDocument) => { stored = { ...value } }),
  }
  return {
    collection,
    get stored() { return stored },
  }
}

describe('app settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates and returns the missing singleton', async () => {
    const fake = appCollection()
    mocks.getReaderDatabase.mockResolvedValue({ appSettings: fake.collection })

    await expect(loadAppSettings()).resolves.toEqual({ id: 'app', persistentStorageRequested: false })
    expect(fake.stored).toEqual({ id: 'app', persistentStorageRequested: false })
  })

  it('returns existing settings without replacing them', async () => {
    const settings: AppSettingsDocument = { id: 'app', persistentStorageRequested: true, persistentStorageGranted: true }
    const fake = appCollection(settings)
    mocks.getReaderDatabase.mockResolvedValue({ appSettings: fake.collection })

    await expect(loadAppSettings()).resolves.toEqual(settings)
    expect(fake.collection.insert).not.toHaveBeenCalled()
  })

  it('persists a persistence result by updating an existing singleton', async () => {
    const fake = appCollection({ id: 'app', persistentStorageRequested: false })
    mocks.getReaderDatabase.mockResolvedValue({ appSettings: fake.collection })

    await savePersistenceResult(true)

    expect(fake.stored).toEqual({ id: 'app', persistentStorageRequested: true, persistentStorageGranted: true })
  })

  it('creates the singleton when saving a persistence result before initialization', async () => {
    const fake = appCollection()
    mocks.getReaderDatabase.mockResolvedValue({ appSettings: fake.collection })

    await savePersistenceResult(false)

    expect(fake.stored).toEqual({ id: 'app', persistentStorageRequested: true, persistentStorageGranted: false })
  })

  it('preserves database failures for callers to handle', async () => {
    const failure = new Error('database unavailable')
    mocks.getReaderDatabase.mockRejectedValue(failure)

    await expect(loadAppSettings()).rejects.toBe(failure)
    await expect(savePersistenceResult(true)).rejects.toBe(failure)
  })
})
