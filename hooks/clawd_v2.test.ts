import { describe, expect, test } from 'claude-code/testing'
import {
  PALETTE,
  anticipateLaunch,
  drawHighResClawd,
  easeInOutCubic,
  highResIdlePose,
  highResStirPose,
} from './lib/clawd_v2'
import { createSubCanvas, toQuadrantCells } from './lib/quadrant'

describe('clawd_v2', () => {
  test('drawHighResClawd renders mascot with 18 sub-pixels width onto canvas', () => {
    // 12 cells wide, 8 cells high -> 24x16 sub-pixels
    const canvas = createSubCanvas(12, 8)
    const pose = highResIdlePose(0)
    drawHighResClawd(canvas, 2, 4, pose, true)

    // Check body pixels are placed
    const cells = toQuadrantCells(canvas)
    expect(cells.length).toBe(12 * 8 * 3)
    // Non-empty cells exist
    const hasVisibleCells = cells.some((val, i) => i % 3 === 0 && val !== 0x0020)
    expect(hasVisibleCells).toBe(true)
  })

  test('highResIdlePose produces smooth breathing and blinking', () => {
    const pStart = highResIdlePose(0)
    const pMid = highResIdlePose(1600) // mid-breath
    expect(pMid.glow).toBeGreaterThan(pStart.glow)
    expect(pMid.arms).toBe('up')

    // At blink tick (50ms)
    const pBlink = highResIdlePose(50)
    expect(pBlink.eyes).toBe('blink')
  })

  test('highResStirPose implements anticipation and hat secondary lag', () => {
    // Phase 1: anticipation (< 0.15 * 1200 = 180ms)
    const pAnticipate = highResStirPose(60)
    expect(pAnticipate.pose.bodyDy).toBeGreaterThan(0) // crouch

    // Phase 2: launch (300ms)
    const pLaunch = highResStirPose(300)
    expect(pLaunch.pose.bodyDy).toBeLessThan(0) // jump up
    expect(pLaunch.pose.hatDy).toBeGreaterThan(pLaunch.pose.bodyDy) // hat lags behind body

    // Apex hang
    const pApex = highResStirPose(500)
    expect(pApex.panDy).toBe(-2)
    expect(pApex.pose.eyes).toBe('up')
  })

  test('easing functions produce expected bounds', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBe(0.5)

    // Anticipation starts near 0, dips positive, then arcs negative
    expect(Math.abs(anticipateLaunch(0)) < 0.001).toBe(true)
    expect(anticipateLaunch(0.1)).toBeGreaterThan(0) // crouch
    expect(anticipateLaunch(0.6)).toBeLessThan(0) // flight
  })
})
