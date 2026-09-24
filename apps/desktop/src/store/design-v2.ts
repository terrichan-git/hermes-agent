import { Codecs, persistentAtom } from '@/lib/persisted'

/**
 * Design v2 — the Codex-style interface, opt-in.
 *
 * The redesign restructures the shell (rail grouping, pane proportions,
 * transcript bubble/prose contrast, composer arrangement), so it cannot ride
 * the theme layer: a preset sets colour/typography/terminal ANSI only and
 * cannot add, move, or resize anything. It is therefore gated behind this one
 * preference, default OFF, so the shipping design stays the default and the
 * new one is a deliberate switch.
 *
 * Why ONE flag for the whole redesign rather than a flag per element: two
 * layouts coexist while this exists, and a layout duplicated across several
 * independent flags rots in the gaps between them (a half-on state nobody
 * designed). One switch keeps exactly two coherent designs — old and new — and
 * the revert is the same switch, in the same place, with no rebuild.
 *
 * Not mode-bound: this is a structural choice, not a per-appearance-mode one,
 * so it must not vary between light and dark.
 */
const DESIGN_V2_STORAGE_KEY = 'hermes.desktop.designV2'

const $designV2Pref = persistentAtom(DESIGN_V2_STORAGE_KEY, false, Codecs.bool)

export const $designV2 = $designV2Pref

export function setDesignV2(on: boolean) {
  $designV2Pref.set(on)
}

export function toggleDesignV2() {
  setDesignV2(!$designV2Pref.get())
}
