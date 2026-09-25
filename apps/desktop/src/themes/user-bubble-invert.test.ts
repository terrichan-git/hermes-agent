import { THEME_PRESET_PALETTES } from '@hermes/shared/theme-presets'
import { describe, expect, it } from 'vitest'

// The bubble fill/ink pair lets a theme paint a SOLID invert — something the
// app's 45%-mix tint cannot express, because the seed is mixed into a neutral
// card and so can only ever be a pale wash.
//
// The theme that used it (Codex) now lives in a desktop plugin
// (~/.hermes/desktop-plugins/codex-theme), so its palette is no longer in the
// shared table. What stays here is the ENGINE-side invariant that made the pair
// safe to add in the first place, and which a plugin theme relies on: the token
// is opt-in. A stray ink on any built-in would repaint that theme's bubble as a
// solid block and silently change what ships today.
describe('user bubble invert', () => {
  it('no shipped preset sets an ink, so their tint rendering is unchanged', () => {
    const palettes = THEME_PRESET_PALETTES as Record<
      string,
      { colors: Record<string, string | undefined>; darkColors?: Record<string, string | undefined> }
    >

    for (const [name, palette] of Object.entries(palettes)) {
      expect(palette.colors.userBubbleForeground, `${name} light`).toBeUndefined()
      expect(palette.darkColors?.userBubbleForeground, `${name} dark`).toBeUndefined()
    }
  })
})
