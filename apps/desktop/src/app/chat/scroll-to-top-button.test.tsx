import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { onScrollToTopOfLastOutputRequest } from '@/store/thread-scroll'

import { ComposerSurfaceProvider } from './composer/scope'
import { ScrollToTopOfLastOutputButton } from './scroll-to-top-button'

afterEach(() => {
  cleanup()
})

// `getByRole('button')` excludes aria-hidden nodes, so "queryByRole null" is
// the control's hidden (nothing above the fold) state.
describe('ScrollToTopOfLastOutputButton', () => {
  it('stays hidden until the reader has scrolled away from the bottom', () => {
    render(<ScrollToTopOfLastOutputButton sessionId="sess-1" visible={false} />)

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers the labelled control once scrolled up', () => {
    render(<ScrollToTopOfLastOutputButton sessionId="sess-1" visible />)

    expect(screen.getByRole('button', { name: 'Scroll to the start of the last answer' })).toBeTruthy()
  })

  it('fires the jump request for its own session on click', () => {
    const handler = vi.fn()
    const stop = onScrollToTopOfLastOutputRequest(handler, 'sess-1')

    render(<ScrollToTopOfLastOutputButton sessionId="sess-1" visible />)
    fireEvent.click(screen.getByRole('button'))

    expect(handler).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not jump a sibling pane’s scroll position', () => {
    const mine = vi.fn()
    const other = vi.fn()
    const stopMine = onScrollToTopOfLastOutputRequest(mine, 'sess-a')
    const stopOther = onScrollToTopOfLastOutputRequest(other, 'sess-b')

    render(<ScrollToTopOfLastOutputButton sessionId="sess-a" visible />)
    fireEvent.click(screen.getByRole('button'))

    expect(mine).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
    stopMine()
    stopOther()
  })

  it('isolates pre-runtime panes by their composer surface identity', () => {
    const handler = vi.fn()
    const stop = onScrollToTopOfLastOutputRequest(handler, 'surface-a')

    render(
      <ComposerSurfaceProvider value="surface-a">
        <ScrollToTopOfLastOutputButton sessionId={null} visible />
      </ComposerSurfaceProvider>
    )
    fireEvent.click(screen.getByRole('button'))

    expect(handler).toHaveBeenCalledTimes(1)
    stop()
  })
})
