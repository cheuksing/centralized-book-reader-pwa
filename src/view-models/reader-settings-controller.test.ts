import { describe, expect, it, vi } from 'vitest'
import { createReaderSettingsController, defaultReaderSettings } from './reader-settings-controller'

describe('reader settings controller', () => {
  it('loads persisted settings and applies bounded commands', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createReaderSettingsController({ load: async () => ({ ...defaultReaderSettings, fontSize: 20 }), save })

    await expect(controller.initialize()).resolves.toEqual({ ...defaultReaderSettings, fontSize: 20 })
    expect(controller.increaseFontSize()).toEqual({ ...defaultReaderSettings, fontSize: 21 })
    expect(controller.decreaseFontSize()).toEqual({ ...defaultReaderSettings, fontSize: 20 })
    expect(controller.setTheme('dark')).toMatchObject({ theme: 'dark' })
    expect(controller.toggleLineHeight()).toMatchObject({ lineHeight: 1.9 })
    expect(controller.setContentWidth('wide')).toMatchObject({ contentWidth: 'wide' })
    expect(save).toHaveBeenCalled()
  })

  it('falls back to defaults and absorbs persistence failures', async () => {
    const save = vi.fn().mockRejectedValue(new Error('settings unavailable'))
    const controller = createReaderSettingsController({ load: async () => { throw new Error('settings unavailable') }, save })

    await expect(controller.initialize()).resolves.toEqual(defaultReaderSettings)
    expect(() => controller.setTheme('light')).not.toThrow()
    await Promise.resolve()
    expect(controller.get()).toMatchObject({ theme: 'light' })
  })
})
