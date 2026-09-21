import type { ReaderSettings } from '@models/entities/domain'

export const defaultReaderSettings: ReaderSettings = { theme: 'system', fontSize: 18, lineHeight: 1.65, contentWidth: 'comfortable', showArticleImages: true }

export interface ReaderSettingsController {
  initialize: () => Promise<ReaderSettings>
  get: () => ReaderSettings
  setTheme: (theme: ReaderSettings['theme']) => ReaderSettings
  decreaseFontSize: () => ReaderSettings
  increaseFontSize: () => ReaderSettings
  toggleLineHeight: () => ReaderSettings
  setContentWidth: (contentWidth: ReaderSettings['contentWidth']) => ReaderSettings
  setShowArticleImages: (showArticleImages: boolean) => ReaderSettings
}

export interface ReaderSettingsPersistence {
  load: () => Promise<ReaderSettings>
  save: (settings: ReaderSettings) => Promise<void>
}

export function createReaderSettingsController(persistence: ReaderSettingsPersistence): ReaderSettingsController {
  let settings = { ...defaultReaderSettings }

  const persist = (next: ReaderSettings): ReaderSettings => {
    settings = next
    void persistence.save(next).catch(() => undefined)
    return settings
  }

  return {
    initialize: async () => {
      try {
        const loaded = await persistence.load()
        settings = normalizeReaderSettings(loaded)
      } catch {
        settings = { ...defaultReaderSettings }
      }
      return settings
    },
    get: () => settings,
    setTheme: (theme) => persist({ ...settings, theme }),
    decreaseFontSize: () => persist({ ...settings, fontSize: Math.max(14, settings.fontSize - 1) }),
    increaseFontSize: () => persist({ ...settings, fontSize: Math.min(28, settings.fontSize + 1) }),
    toggleLineHeight: () => persist({ ...settings, lineHeight: settings.lineHeight === 1.65 ? 1.9 : 1.65 }),
    setContentWidth: (contentWidth) => persist({ ...settings, contentWidth }),
    setShowArticleImages: (showArticleImages) => persist({ ...settings, showArticleImages }),
  }
}

function normalizeReaderSettings(value: ReaderSettings | undefined): ReaderSettings {
  if (!value) return { ...defaultReaderSettings }
  return {
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : 'system',
    fontSize: Number.isFinite(value.fontSize) ? Math.min(28, Math.max(14, value.fontSize)) : defaultReaderSettings.fontSize,
    lineHeight: Number.isFinite(value.lineHeight) ? Math.min(2.2, Math.max(1.2, value.lineHeight)) : defaultReaderSettings.lineHeight,
    contentWidth: value.contentWidth === 'compact' || value.contentWidth === 'wide' ? value.contentWidth : 'comfortable',
    showArticleImages: value.showArticleImages !== false,
  }
}
