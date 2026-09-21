import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Publication } from '@models/entities/domain'
import type { ReaderUiAdapterInput } from './reader-ui-adapter'

const mocks = vi.hoisted(() => ({
  activePublication: undefined as Publication | undefined,
  readerState: {} as Record<string, unknown>,
  online: true,
  searchParams: new URLSearchParams(),
  openPublication: vi.fn(),
  navigate: vi.fn(),
  historyBack: vi.fn(),
  setSearchParams: vi.fn(),
  useReaderUiAdapter: vi.fn(),
  input: undefined as ReaderUiAdapterInput | undefined,
  settingsState: { showArticleImages: true },
  setShowArticleImages: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useCallback: <T,>(callback: T) => callback,
    useEffect: (effect: () => void | (() => void)) => { effect() },
  }
})


vi.mock('wouter', () => ({
  useLocation: () => ['/reader/reader', mocks.navigate],
  useSearchParams: () => [mocks.searchParams, mocks.setSearchParams],
}))
vi.mock('@app/app-view-model', () => ({ useAppViewModel: (selector: (state: { activePublication?: Publication }) => unknown) => selector({ activePublication: mocks.activePublication }) }))
vi.mock('@view-models/reader-view-model', () => ({ useReaderViewModel: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.readerState) }))
vi.mock('@view-models/settings-view-model', () => ({ useSettingsViewModel: (selector: (state: { settings: { showArticleImages: boolean }; setShowArticleImages: typeof mocks.setShowArticleImages }) => unknown) => selector({ settings: mocks.settingsState, setShowArticleImages: mocks.setShowArticleImages }) }))
vi.mock('../ui/use-online-status', () => ({ useOnlineStatus: () => mocks.online }))
vi.mock('./reader-ui-adapter', () => ({ useReaderUiAdapter: mocks.useReaderUiAdapter }))

import { ReaderContainer } from './reader-container'

function publication(): Publication {
  return { key: 'reader', sourceId: 'source', publicationId: 'reader', title: 'Reader', kind: 'book', createdAt: '2026-01-01T00:00:00.000Z', coverState: 'missing', bookmarked: false, availability: 'available' }
}

beforeEach(() => {
  const currentPublication = publication()
  mocks.activePublication = currentPublication
  mocks.searchParams = new URLSearchParams('chapter=chapter-2&controls=1')
  mocks.openPublication.mockReset()
  mocks.navigate.mockReset()
  mocks.historyBack.mockReset()
  vi.stubGlobal('window', { history: { back: mocks.historyBack } })
  mocks.setSearchParams.mockReset()
  mocks.input = undefined
  mocks.settingsState = { showArticleImages: true }
  mocks.setShowArticleImages.mockReset()
  mocks.useReaderUiAdapter.mockReset()
  mocks.useReaderUiAdapter.mockImplementation((input: ReaderUiAdapterInput) => {
    mocks.input = input
    return { className: 'reader', style: { fontSize: '18px', lineHeight: 1.65 }, body: createElement('p', null, 'reader body') }
  })
  mocks.readerState = {
    settings: { theme: 'light', fontSize: 18, lineHeight: 1.65, contentWidth: 'comfortable', showArticleImages: true },
    publicationKey: undefined,
    chapters: [],
    chapterIndex: 0,
    chapterNextCursor: undefined,
    chapterCursorPublicationKey: undefined,
    readerChapters: [],
    resumeLocator: undefined,
    isLoading: false,
    isLoadingChapter: false,
    isLoadingPreviousChapter: false,
    isLoadingNextChapter: false,
    isLoadingMoreChapters: false,
    error: undefined,
    openPublication: mocks.openPublication,
    loadAdjacentChapter: vi.fn(),
    selectAdjacentChapter: vi.fn(),
    ensureImage: vi.fn(),
    updateVisibleSection: vi.fn(),
    flushProgress: vi.fn().mockResolvedValue(undefined),
    closeBook: vi.fn().mockResolvedValue(undefined),
    setTheme: vi.fn(),
    decreaseFontSize: vi.fn(),
    increaseFontSize: vi.fn(),
    toggleLineHeight: vi.fn(),
    setContentWidth: vi.fn(),
    setShowArticleImages: vi.fn(),
  }
})

describe('reader route navigation', () => {
  it('cleans up before explicitly navigating to the bookshelf root', async () => {
    let resolveCloseBook!: () => void
    const closeBookPromise = new Promise<void>((resolve) => { resolveCloseBook = resolve })
    const closeBook = vi.fn(() => closeBookPromise)
    mocks.openPublication.mockResolvedValue(false)
    mocks.readerState = { ...mocks.readerState, closeBook }

    const element = ReaderContainer() as unknown as { type?: unknown; props?: Record<string, unknown> }
    if (typeof element.type === 'function') (element.type as (props: Record<string, unknown>) => unknown)(element.props ?? {})

    mocks.input?.onLeave()
    expect(closeBook).toHaveBeenCalledOnce()
    expect(mocks.navigate).not.toHaveBeenCalled()

    resolveCloseBook()
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'))
    expect(mocks.historyBack).not.toHaveBeenCalled()
  })
})

describe('reader route retry', () => {
  it('retains the requested chapter query after failure and clears it after a successful retry', async () => {
    const currentPublication = mocks.activePublication!
    mocks.openPublication.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const element = ReaderContainer() as unknown as { type?: unknown; props?: Record<string, unknown> }
    if (typeof element.type === 'function') (element.type as (props: Record<string, unknown>) => unknown)(element.props ?? {})
    await vi.waitFor(() => expect(mocks.openPublication).toHaveBeenCalledWith(currentPublication, 'chapter-2'))
    expect(mocks.setSearchParams).not.toHaveBeenCalled()

    mocks.input?.onOpenPublication()
    await vi.waitFor(() => expect(mocks.openPublication).toHaveBeenCalledTimes(2))
    expect(mocks.openPublication).toHaveBeenNthCalledWith(2, currentPublication, 'chapter-2')
    await vi.waitFor(() => expect(mocks.setSearchParams).toHaveBeenCalledOnce())

    const [update, options] = mocks.setSearchParams.mock.calls[0] as [(current: URLSearchParams) => URLSearchParams, { replace: boolean }]
    const updated = update(new URLSearchParams('chapter=chapter-2&controls=1'))
    expect(updated.get('chapter')).toBeNull()
    expect(updated.get('controls')).toBe('1')
    expect(options).toEqual({ replace: true })
  })
})
