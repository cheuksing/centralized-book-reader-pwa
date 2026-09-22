import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeOPFSDatabase } from './opfs-rx-storage'

describe('OPFS database cleanup', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('removes the entire database directory recursively', async () => {
    const removeEntry = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn(async () => ({ removeEntry })) } })

    await removeOPFSDatabase('bookshelf-prototype-current-generation')

    expect(removeEntry).toHaveBeenCalledOnce()
    expect(removeEntry).toHaveBeenCalledWith('bookshelf-prototype-current-generation', { recursive: true })
  })

  it('ignores an already-removed database directory', async () => {
    const removeEntry = vi.fn(async () => { throw new DOMException('missing', 'NotFoundError') })
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn(async () => ({ removeEntry })) } })

    await expect(removeOPFSDatabase('bookshelf-prototype-current-generation')).resolves.toBeUndefined()
  })
})
