import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  $threadJumpButtonVisibleBySession,
  $threadMessagesBelowBySession,
  $threadScrolledUpBySession,
  onScrollToBottomRequest,
  publishThreadAtBottom,
  publishThreadMessagesBelow,
  requestScrollToBottom,
  resetPublishedThreadScroll,
  resetThreadScroll,
  setThreadAtBottom,
  threadScrollDistanceFromBottom,
  threadScrollTargetTop
} from './thread-scroll'

afterEach(() => {
  resetThreadScroll('session-a')
  resetThreadScroll('session-b')
})

describe('publishThreadAtBottom', () => {
  it('lets the visible pane flash the jump pill when the thread leaves the bottom', () => {
    publishThreadAtBottom(false, { paneVisible: true, sessionId: 'session-a' })

    expect(Boolean($threadJumpButtonVisibleBySession.get()['session-a'])).toBe(true)
    expect(Boolean($threadScrolledUpBySession.get()['session-a'])).toBe(true)
  })

  it('ignores stick-to-bottom misses from a hidden keep-alive pane', () => {
    setThreadAtBottom(true, 'session-a')

    publishThreadAtBottom(false, { paneVisible: false, sessionId: 'session-a' })

    expect(Boolean($threadJumpButtonVisibleBySession.get()['session-a'])).toBe(false)
    expect(Boolean($threadScrolledUpBySession.get()['session-a'])).toBe(false)
  })

  it("keeps the visible pane's scrolled-up chrome when a hidden pane publishes", () => {
    publishThreadAtBottom(false, { paneVisible: true, sessionId: 'session-a' })

    publishThreadAtBottom(true, { paneVisible: false, sessionId: 'session-a' })

    expect(Boolean($threadJumpButtonVisibleBySession.get()['session-a'])).toBe(true)
    expect(Boolean($threadScrolledUpBySession.get()['session-a'])).toBe(true)
  })
})

describe('resetPublishedThreadScroll', () => {
  it('resets only the unmounting session, including its message count', () => {
    for (const sessionId of ['session-a', 'session-b']) {
      publishThreadAtBottom(false, { paneVisible: true, sessionId })
      publishThreadMessagesBelow(7, { paneVisible: true, sessionId })
    }

    resetPublishedThreadScroll({ paneVisible: true, sessionId: 'session-a' })

    expect($threadJumpButtonVisibleBySession.get()['session-a']).toBeUndefined()
    expect($threadScrolledUpBySession.get()['session-a']).toBeUndefined()
    expect($threadMessagesBelowBySession.get()['session-a']).toBeUndefined()
    expect($threadJumpButtonVisibleBySession.get()['session-b']).toBe(true)
    expect($threadScrolledUpBySession.get()['session-b']).toBe(true)
    expect($threadMessagesBelowBySession.get()['session-b']).toBe(7)
  })

  it('preserves mirror references on no-op ticks, hidden publications, and missing identities', () => {
    publishThreadAtBottom(false, { paneVisible: true, sessionId: 'session-a' })
    publishThreadMessagesBelow(7, { paneVisible: true, sessionId: 'session-a' })
    const flags = $threadScrolledUpBySession.get()
    const jump = $threadJumpButtonVisibleBySession.get()
    const counts = $threadMessagesBelowBySession.get()

    publishThreadAtBottom(false, { paneVisible: true, sessionId: 'session-a' })
    publishThreadMessagesBelow(7, { paneVisible: true, sessionId: 'session-a' })
    publishThreadMessagesBelow(0, { paneVisible: false, sessionId: 'session-a' })
    resetPublishedThreadScroll({ paneVisible: false, sessionId: 'session-a' })
    publishThreadAtBottom(false, { paneVisible: true, sessionId: null })
    publishThreadMessagesBelow(12, { paneVisible: true, sessionId: null })
    resetThreadScroll(null)

    expect($threadScrolledUpBySession.get()).toBe(flags)
    expect($threadJumpButtonVisibleBySession.get()).toBe(jump)
    expect($threadMessagesBelowBySession.get()).toBe(counts)
  })

  it('clears the jump pill when the visible pane unmounts', () => {
    setThreadAtBottom(false, 'session-a')

    resetPublishedThreadScroll({ paneVisible: true, sessionId: 'session-a' })

    expect(Boolean($threadJumpButtonVisibleBySession.get()['session-a'])).toBe(false)
    expect(Boolean($threadScrolledUpBySession.get()['session-a'])).toBe(false)
  })

  it('does not clear the visible pane when a hidden list unmounts', () => {
    setThreadAtBottom(false, 'session-a')

    resetPublishedThreadScroll({ paneVisible: false, sessionId: 'session-a' })

    expect(Boolean($threadJumpButtonVisibleBySession.get()['session-a'])).toBe(true)
    expect(Boolean($threadScrolledUpBySession.get()['session-a'])).toBe(true)
  })
})

describe('requestScrollToBottom', () => {
  it('routes a scroll request only to its session', () => {
    const sessionA = vi.fn()
    const sessionB = vi.fn()
    const stopA = onScrollToBottomRequest(sessionA, 'session-a')
    const stopB = onScrollToBottomRequest(sessionB, 'session-b')

    requestScrollToBottom('session-b')

    expect(sessionA).not.toHaveBeenCalled()
    expect(sessionB).toHaveBeenCalledOnce()
    stopA()
    stopB()
  })

  it("does not let a late unmount clear a newer session's handler", () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = onScrollToBottomRequest(first, 'session-a')
    const stopSecond = onScrollToBottomRequest(second, 'session-a')

    stopFirst()
    requestScrollToBottom('session-a')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    stopSecond()
  })
})

// The scroll-up button lands on a turn's top by converting that turn's geometry
// into a from-bottom offset and letting the restore machinery re-apply it. An
// offset computed in the wrong frame still looks plausible — it just lands the
// reader somewhere else — so pin the round trip: geometry in, same scrollTop
// out. (A missing `scrollTop` term here silently sends the reader a full
// viewport too far up, which reads as "the button did something odd".)
describe('threadScrollDistanceFromBottom ↔ threadScrollTargetTop', () => {
  const metrics = { clientHeight: 600, scrollHeight: 4000 }

  it('round-trips a node positioned at the viewport top', () => {
    // Node top flush with the viewport top → the scrollTop that shows it is
    // just the current scrollTop.
    const scrollTop = 1500
    const viewportTop = 100
    const nodeTop = 100

    const fromBottom = Math.max(
      0,
      metrics.scrollHeight - scrollTop - (nodeTop - viewportTop) - metrics.clientHeight
    )

    expect(fromBottom).toBe(metrics.scrollHeight - scrollTop - metrics.clientHeight)
    expect(threadScrollTargetTop({ fromBottom, kind: 'offset' }, metrics)).toBe(scrollTop)
  })

  it('reproduces the offset the machinery would store for the landed position', () => {
    const scrollTop = 1500
    const viewportTop = 100
    // Node sits 240px below the viewport top, so landing on it scrolls down 240.
    const nodeTop = 340

    const fromBottom = Math.max(
      0,
      metrics.scrollHeight - scrollTop - (nodeTop - viewportTop) - metrics.clientHeight
    )

    const landed = threadScrollTargetTop({ fromBottom, kind: 'offset' }, metrics)

    expect(landed).toBe(scrollTop + 240)
    expect(threadScrollDistanceFromBottom({ ...metrics, scrollTop: landed })).toBe(fromBottom)
  })

  it('never returns a negative scrollTop, even for an over-large offset', () => {
    // An offset deeper than the whole scroll range (content shrank, or a stale
    // measurement) must clamp to the top, not go negative.
    const max = metrics.scrollHeight - metrics.clientHeight

    expect(threadScrollTargetTop({ fromBottom: max + 500, kind: 'offset' }, metrics)).toBe(0)
    expect(threadScrollTargetTop({ fromBottom: max, kind: 'offset' }, metrics)).toBe(0)
  })
})
