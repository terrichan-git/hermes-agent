import { useMemo, useRef } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { requestScrollToTopOfLastOutput } from '@/store/thread-scroll'

import { useComposerSurfaceId } from './composer/scope'

/**
 * Floating "jump to the start of the last answer" control. Sits at the RIGHT
 * edge of the composer column, level with the centred jump-to-bottom pill, and
 * lands the viewport on the first row of the newest assistant output.
 *
 * It exists because the jump-to-bottom pill answers "take me forward" and
 * nothing answered "take me back to the top of what I just read" — with a long
 * streamed answer the user had to scroll by hand hunting for where it began.
 *
 * Visibility is the mirror of the bottom pill: the bottom pill shows once you
 * scroll AWAY from the bottom; this one shows once you have scrolled DOWN into
 * an answer long enough that its start is off-screen, i.e. only while there is
 * something above the fold to return to. `$threadScrolledUpBySession` already
 * carries exactly that fact (published by the thread viewport), so no new
 * per-frame scroll math is needed here.
 *
 * Deliberately quiet: it is a convenience, not a call to action, so it wears
 * the same neutral fill as the bottom pill and never steals the accent.
 */
export function ScrollToTopOfLastOutputButton({
  sessionId,
  visible
}: {
  sessionId: string | null
  visible: boolean
}) {
  const { t } = useI18n()
  const surfaceId = useComposerSurfaceId()
  const scrollSessionId = sessionId ?? surfaceId
  const hasShownRef = useRef(false)

  if (visible) {
    hasShownRef.current = true
  }

  // Reuse the bottom pill's enter/exit contract (styles.css `.thread-jump-button`)
  // so the two read as one pair: `idle` stays silent so it cannot flash on
  // mount, then in/out animate off `data-state`.
  const state = visible ? 'in' : hasShownRef.current ? 'out' : 'idle'
  const label = useMemo(() => t.assistant.thread.scrollToLastAnswer, [t])

  return (
    <Tip label={label}>
      <button
        aria-hidden={!visible}
        aria-label={label}
        className="thread-jump-button top-button absolute z-20 grid size-8 place-items-center rounded-full border border-border/65 bg-(--composer-fill) text-muted-foreground backdrop-blur-[0.75rem] [-webkit-backdrop-filter:blur(0.75rem)] hover:text-foreground"
        data-state={state}
        onClick={() => {
          triggerHaptic('selection')
          requestScrollToTopOfLastOutput(scrollSessionId)
        }}
        style={{
          bottom: 'calc(var(--composer-measured-height) + 1rem)',
          // Anchored to the right edge of the composer column rather than
          // centred, so it clears the jump-to-bottom pill in the middle. The
          // composer's own width token carries the inset, keeping the pill in
          // the transcript's visual column instead of pinned to the window.
          right: 'calc(50% - (var(--composer-width) / 2) + 0.25rem)'
        }}
        tabIndex={visible ? 0 : -1}
        type="button"
      >
        <Codicon name="arrow-up" size="0.875rem" />
      </button>
    </Tip>
  )
}
