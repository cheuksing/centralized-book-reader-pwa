import { describe, expect, it, vi } from 'vitest'

vi.mock('./status-slot.scss', () => ({}))

import { StatusSlot } from './status-slot'

describe('StatusSlot', () => {
  it('keeps the reserved region mounted while hiding only empty content', () => {
    const empty = StatusSlot({ message: undefined })
    const visible = StatusSlot({ message: 'Storage is being refreshed.', role: 'alert' })

    expect(empty.props).toMatchObject({ 'data-empty': true, 'aria-hidden': true })
    expect(visible.props).toMatchObject({ 'data-empty': false, 'aria-hidden': undefined, role: 'alert', children: 'Storage is being refreshed.' })
  })
})
