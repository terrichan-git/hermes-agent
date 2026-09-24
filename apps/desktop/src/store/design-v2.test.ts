import { beforeEach, describe, expect, it } from 'vitest'

import { $designV2, setDesignV2, toggleDesignV2 } from './design-v2'

// The whole revert story for the redesign rests on this one preference: it must
// start OFF (the shipping design is the default), persist across a reload, and
// never be flipped by anything but an explicit call.
describe('design v2 preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setDesignV2(false)
  })

  it('defaults to off, so the current design stays the default', () => {
    window.localStorage.clear()

    // A fresh store reads the default, not a stale write.
    expect($designV2.get()).toBe(false)
  })

  it('persists across a reload', () => {
    setDesignV2(true)
    expect(window.localStorage.getItem('hermes.desktop.designV2')).toBe('true')

    setDesignV2(false)
    expect(window.localStorage.getItem('hermes.desktop.designV2')).toBe('false')
  })

  it('round-trips through the persisted codec', () => {
    // The codec is `raw === 'true'`, so only the literal string turns it on —
    // this is what stops a hand-edited storage value enabling the redesign.
    window.localStorage.setItem('hermes.desktop.designV2', 'yes')
    expect($designV2.get()).toBe(false)
  })

  it('toggles', () => {
    expect($designV2.get()).toBe(false)

    toggleDesignV2()
    expect($designV2.get()).toBe(true)

    toggleDesignV2()
    expect($designV2.get()).toBe(false)
  })
})
