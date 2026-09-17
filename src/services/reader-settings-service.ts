import type { ReaderSettings } from '@models/entities/domain'

export const defaultReaderSettings: ReaderSettings = {
  theme: 'system',
  fontSize: 18,
  lineHeight: 1.65,
  contentWidth: 'comfortable',
}

async function getReaderSettingsCollection() {
  const { getReaderDatabase } = await import('@models/database/opfs-database')
  return (await getReaderDatabase()).readerSettings
}

export async function loadReaderSettings(): Promise<ReaderSettings> {
  const readerSettings = await getReaderSettingsCollection()
  const stored = await readerSettings.findOne('global').exec()
  if (!stored) {
    try {
      await readerSettings.insert({ id: 'global', scope: 'global', ...defaultReaderSettings })
      return defaultReaderSettings
    } catch (error) {
      const concurrent = await readerSettings.findOne('global').exec()
      if (!concurrent) throw error
      const { theme, fontSize, lineHeight, contentWidth } = concurrent.toJSON()
      return { theme, fontSize, lineHeight, contentWidth }
    }
  }

  const { theme, fontSize, lineHeight, contentWidth } = stored.toJSON()
  return { theme, fontSize, lineHeight, contentWidth }
}

export async function saveReaderSettings(settings: ReaderSettings): Promise<void> {
  const readerSettings = await getReaderSettingsCollection()
  const stored = await readerSettings.findOne('global').exec()
  if (stored) await stored.patch(settings)
  else await readerSettings.insert({ id: 'global', scope: 'global', ...settings })
}
