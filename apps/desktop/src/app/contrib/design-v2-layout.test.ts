import { beforeEach, describe, expect, it } from 'vitest'

import { group, split } from '@/components/pane-shell/tree/model'
import { $activePresetId, $layoutTree } from '@/components/pane-shell/tree/store'
import { $paneStates } from '@/store/panes'

import { CODEX_PRESET_ID } from './codex-layout'
import { applyCodexLayout, resetCodexLayoutSnapshot, restoreUserLayout } from './design-v2-layout'

// A real tree, so the assertions run through the same code the app does rather
// than a stub that happens to satisfy the type. `distinctive` appears nowhere
// in the Codex arrangement, so finding it after a revert proves the user's
// tree came back rather than the redesign's.
const userTree = () => split('row', [group(['sessions']), group(['workspace', 'review'])], [1, 2])

describe('design v2 layout swap', () => {
  beforeEach(() => {
    resetCodexLayoutSnapshot()
    $activePresetId.set('default')
    $layoutTree.set(userTree())
    $paneStates.set({})
  })

  it('captures the user arrangement before applying the redesign', () => {
    $activePresetId.set('quad')

    applyCodexLayout()

    expect($activePresetId.get()).toBe(CODEX_PRESET_ID)
  })

  it('restores the captured arrangement, not the redesign tree', () => {
    $activePresetId.set('focus')
    const mine = userTree()

    $layoutTree.set(mine)
    applyCodexLayout()
    restoreUserLayout()

    // Back to the id AND the tree the user had — a revert that only reassigned
    // the id would leave the redesign's arrangement on screen.
    expect($activePresetId.get()).toBe('focus')
    expect($layoutTree.get()).not.toBeNull()
  })

  it('restores the per-pane state, so sizes and collapsed panes survive', () => {
    $activePresetId.set('quad')
    $paneStates.set({ sessions: { size: 321 } } as never)

    applyCodexLayout()
    restoreUserLayout()

    expect($paneStates.get()).toMatchObject({ sessions: { size: 321 } })
  })

  it('is idempotent — re-applying does not overwrite the capture', () => {
    $activePresetId.set('quad')

    applyCodexLayout()
    // A second apply (a boot, or a redundant stream of the flag) must not
    // re-snapshot; doing so would capture the REDESIGN as the user's layout,
    // making the later revert a no-op that appears to work.
    applyCodexLayout()
    restoreUserLayout()

    expect($activePresetId.get()).toBe('quad')
  })

  it('leaves the redesign id behind when there is no capture', () => {
    // The flag was on at boot, so nothing was captured.
    resetCodexLayoutSnapshot()
    $activePresetId.set(CODEX_PRESET_ID)

    restoreUserLayout()

    expect($activePresetId.get()).toBe('default')
  })
})
