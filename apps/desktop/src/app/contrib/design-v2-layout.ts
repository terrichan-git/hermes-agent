import { computed } from 'nanostores'

import type { LayoutNode } from '@/components/pane-shell/tree/model'
import { applyLayoutPreset } from '@/components/pane-shell/tree/presets'
import { $activePresetId, $layoutTree } from '@/components/pane-shell/tree/store'
import { $designV2 } from '@/store/design-v2'
import { $paneStates, type PaneStateSnapshot } from '@/store/panes'

import { CODEX_PRESET_ID, codexTree } from './codex-layout'

/**
 * The design-v2 layout controller.
 *
 * $designV2 says the user wants the redesigned interface. This module is what
 * makes that mean something: it applies the Codex arrangement when the flag is
 * on and puts the previous arrangement back when it is off.
 *
 * Reverting is the whole point, so this is built as a SWAP, not a mutation of
 * the user's layout. The arrangement they had before the flag was turned on is
 * captured first and restored on the way out, including the per-pane state
 * (sizes, collapsed/hidden, docks) — swapping only the tree is the bug the
 * onboarding code already documents: it left a later layout's panes behind.
 *
 * Deliberately NOT wired to persist the snapshot across restarts: a preference
 * stored on disk outliving the layout it belongs to would let a crash mid-swap
 * strand the session in a layout the flag no longer describes. If the app
 * restarts with the flag on, the tree is re-applied from code, which is
 * idempotent — so the failure mode is "the redesign is showing", never a shell
 * that matches neither design.
 */

/** What the user's layout looked like before the redesign took over. */
interface LayoutSnapshot {
  id: string
  tree: LayoutNode | null
  panes: Record<string, PaneStateSnapshot>
}

let snapshot: LayoutSnapshot | null = null

/**
 * Apply the redesign's arrangement. Idempotent: calling it while the redesign
 * is already applied is a no-op, so it is safe to run on every boot and on
 * every stream of the flag.
 */
export function applyCodexLayout(): void {
  // Already showing the redesign — do not re-snapshot, which would overwrite
  // the user's real layout with the redesign's own tree and make revert a
  // no-op that looks like it worked.
  if ($activePresetId.get() === CODEX_PRESET_ID) {
    return
  }

  snapshot = {
    id: $activePresetId.get(),
    tree: $layoutTree.get(),
    panes: $paneStates.get()
  }

  const trees = codexTree()

  applyLayoutPreset(CODEX_PRESET_ID, trees.codex)
}

/**
 * Put the user's arrangement back. Falls back to `default` when there was no
 * capture (the flag was on at boot, or storage was cleared), so this always
 * lands on a real layout rather than leaving the redesign's tree in place.
 */
export function restoreUserLayout(): void {
  const previous = snapshot
  snapshot = null

  if (previous?.tree) {
    $paneStates.set(previous.panes)
    applyLayoutPreset(previous.id, previous.tree)

    return
  }

  // No capture: the redesign was applied at boot, or the capture was lost.
  // `default` is the app's own default and is always registered, so this can
  // never leave the Codex tree behind with the flag off.
  applyLayoutPreset('default', codexTree().defaultTree)
}

/** True while the redesign owns the layout. */
export const $codexLayoutActive = computed($activePresetId, id => id === CODEX_PRESET_ID)

/** Test seam: forget any capture without touching the live layout. */
export function resetCodexLayoutSnapshot(): void {
  snapshot = null
}

/**
 * Drive the swap from the preference. Starts with the current value so a boot
 * that finds the preference already on applies the redesign, then follows
 * every later change — which is the revert path.
 */
export function watchDesignV2Layout(): void {
  if ($designV2.get()) {
    applyCodexLayout()
  }

  $designV2.listen(on => {
    if (on) {
      applyCodexLayout()

      return
    }

    restoreUserLayout()
  })
}
