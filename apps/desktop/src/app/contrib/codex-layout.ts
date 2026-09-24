import { group, split } from '@/components/pane-shell/tree/model'

import { DEFAULT_TREE } from './layout-presets'

/** The preset id the design-v2 preference applies. */
export const CODEX_PRESET_ID = 'codex'

/**
 * The redesign's pane arrangement — the column order and proportions of the v4
 * prototype's grid:
 *
 *   grid-template-columns: var(--rail) minmax(0,1fr) var(--panel)
 *
 * Built here rather than in layout-presets.ts so the arrangement is reachable
 * without going through the registered preset shelf, and so the fallback tree
 * travels with it. Kept a function so every caller gets a fresh object: the
 * tree model is mutated in place by live layout edits, and handing the same
 * instance to two callers couples them.
 */
export function codexTree() {
  return {
    // The redesign itself: rail | conversation-over-dock | tooling.
    //
    // Weights are the v4 ratios over a nominal 1440px window
    // (244 : 896 : 300) — the closest fractional reading of that grid. A tree
    // carries weights, not pixels, so the reference's FIXED 244/300 cannot be
    // reproduced exactly; the rail's real width is also clamped by its pane.
    codex: split(
      'row',
      [
        group(['sessions'], { id: 'grp-rail' }),
        split(
          'column',
          [group(['workspace'], { id: 'grp-main' }), group(['terminal'], { id: 'grp-dock' })],
          [3, 1],
          'spl-codex-dock'
        ),
        split(
          'row',
          [group(['review'], { id: 'grp-review' }), group(['files'], { id: 'grp-files' })],
          [1, 1],
          'spl-codex-tools'
        )
      ],
      [244, 896, 300],
      'spl-codex-root'
    ),
    // Where revert lands when there was no capture to restore.
    defaultTree: DEFAULT_TREE
  }
}
