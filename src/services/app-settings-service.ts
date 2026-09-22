import type { AppSettingsDocument } from '@models/database/schemas'

const defaultAppSettings: AppSettingsDocument = { id: 'app', persistentStorageRequested: false }

async function getCollection() {
  const { getReaderDatabase } = await import('@models/database/opfs-database')
  return (await getReaderDatabase()).appSettings
}

export async function loadAppSettings(): Promise<AppSettingsDocument> {
  const collection = await getCollection()
  const stored = await collection.findOne('app').exec()
  if (stored) return stored.toJSON()
  await collection.insert(defaultAppSettings)
  return defaultAppSettings
}

export async function savePersistenceResult(granted: boolean): Promise<void> {
  const collection = await getCollection()
  const stored = await collection.findOne('app').exec()
  if (stored) await stored.patch({ persistentStorageRequested: true, persistentStorageGranted: granted })
  else await collection.insert({ ...defaultAppSettings, persistentStorageRequested: true, persistentStorageGranted: granted })
}
