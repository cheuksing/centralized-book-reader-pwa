import { requestPersistentStorage } from '@models/cache/cache-policy'
import { savePersistenceResult } from '@services/app-settings-service'

export async function requestPersistentStorageAccess(): Promise<string> {
  const granted = await requestPersistentStorage()
  await savePersistenceResult(granted)
  return granted ? 'Persistent storage granted' : 'Browser did not grant persistent storage'
}

export async function storageEstimate(): Promise<StorageEstimate | undefined> {
  return navigator.storage?.estimate?.()
}
