import { contrastRatio } from '@hermes/shared/color'
import { THEME_PRESET_PALETTES } from '@hermes/shared/theme-presets'
import { describe, expect, it } from 'vitest'

import { BUILTIN_THEMES, codexTheme } from './presets'

// The bubble fill/ink pair is what makes the design's transcript possible: a
// SOLID invert the app's 45%-mix tint cannot express. These assert the
// invitation is honoured (both set, readable) and, just as importantly, that
// themes which do NOT opt in are untouched.
const codex = THEME_PRESET_PALETTES.codex

describe('user bubble invert', () => {
  it('codex sets the fill and ink together, in both modes', () => {
    expect(codex.colors.userBubble).toBeTruthy()
    expect(codex.colors.userBubbleForeground).toBeTruthy()
    expect(codex.darkColors?.userBubble).toBeTruthy()
    expect(codex.darkColors?.userBubbleForeground).toBeTruthy()
  })

  it('the codex bubble is readable at AAA in both modes', () => {
    // 7:1 is AAA for body text — this bubble IS body text.
    expect(contrastRatio(codex.colors.userBubble!, codex.colors.userBubbleForeground!)).toBeGreaterThanOrEqual(7)
    expect(
      contrastRatio(codex.darkColors!.userBubble!, codex.darkColors!.userBubbleForeground!)
    ).toBeGreaterThanOrEqual(7)
  })

  it('the light bubble is a true invert, not a wash', () => {
    // Guards the regression this whole token exists to prevent: a black seed
    // through the tint path renders as a mid-grey, which is what the old preset
    // did. A solid fill must stay near-black.
    expect(contrastRatio(codex.colors.userBubble!, '#ffffff')).toBeGreaterThan(15)
  })

  it('the dark bubble inverts the other way, so it stays visible on the canvas', () => {
    // A black bubble on a #0d0d0d canvas is invisible; the fill must be light.
    expect(contrastRatio(codex.darkColors!.userBubble!, codex.darkColors!.background!)).toBeGreaterThan(10)
  })

  it('no other theme sets an ink, so their tint rendering is unchanged', () => {
    // The pair is opt-in. A stray ink on a pre-existing theme would repaint its
    // bubble as a solid block and change what ships today.
    const palettes = THEME_PRESET_PALETTES as Record<
      string,
      { colors: Record<string, string | undefined>; darkColors?: Record<string, string | undefined> }
    >

    for (const [name, palette] of Object.entries(palettes)) {
      if (name === 'codex') {
        continue
      }

      expect(palette.colors.userBubbleForeground, `${name} light`).toBeUndefined()
      expect(palette.darkColors?.userBubbleForeground, `${name} dark`).toBeUndefined()
    }
  })

  it('the desktop theme carries the codex ink through to the registry', () => {
    expect(BUILTIN_THEMES.codex).toBe(codexTheme)
    expect(codexTheme.colors.userBubbleForeground).toBe('#ffffff')
  })
})
