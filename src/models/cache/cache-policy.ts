export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}

export async function getStorageEstimate(): Promise<StorageEstimate | undefined> {
  return navigator.storage?.estimate?.()
}
