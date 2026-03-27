/**
 * @fileoverview Structural tests for updater.rs apply_update sequence.
 *
 * Ensures check() is called before take() so that a network failure
 * during the second check does not discard already-downloaded bytes.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const TAURI_ROOT = path.resolve(__dirname, '../../../src-tauri')

/**
 * Extract the body of a Rust function from its declaration to the next
 * `#[tauri::command]` attribute or end of `#[cfg(test)]` module.
 */
function extractRustFnBody(source: string, fnSignature: string): string {
  const fnIdx = source.indexOf(fnSignature)
  if (fnIdx === -1) return ''
  const body = source.slice(fnIdx)
  // Find the end: next #[tauri::command] or #[cfg(test)] or EOF
  const nextCommand = body.indexOf('#[tauri::command]', fnSignature.length)
  const nextCfgTest = body.indexOf('#[cfg(test)]', fnSignature.length)
  const candidates = [nextCommand, nextCfgTest].filter((i) => i > 0)
  const end = candidates.length > 0 ? Math.min(...candidates) : body.length
  return body.slice(0, end)
}

describe('updater.rs — apply_update sequence', () => {
  let applyUpdateBody: string

  beforeAll(() => {
    const updaterPath = path.join(TAURI_ROOT, 'src', 'commands', 'updater.rs')
    const source = fs.readFileSync(updaterPath, 'utf-8')
    applyUpdateBody = extractRustFnBody(source, 'pub async fn apply_update')
    expect(applyUpdateBody.length).toBeGreaterThan(0)
  })

  it('calls .check() before .take() to avoid discarding downloaded bytes', () => {
    const checkIdx = applyUpdateBody.indexOf('.check()')
    const takeIdx = applyUpdateBody.indexOf('.take()')
    expect(checkIdx).toBeGreaterThan(0)
    expect(takeIdx).toBeGreaterThan(0)
    expect(checkIdx).toBeLessThan(takeIdx)
  })

  it('calls .take() exactly once (no duplicate consumption)', () => {
    const matches = applyUpdateBody.match(/\.take\(\)/g)
    expect(matches).toHaveLength(1)
  })
})

describe('updater.rs — version-pinned package cache', () => {
  let updaterSource: string
  const updaterPath = path.join(TAURI_ROOT, 'src', 'commands', 'updater.rs')

  beforeAll(() => {
    updaterSource = fs.readFileSync(updaterPath, 'utf-8')
  })

  it('defines DownloadedPackage struct with downloaded_version field', () => {
    expect(updaterSource).toContain('struct DownloadedPackage')
    expect(updaterSource).toMatch(/downloaded_version:\s*String/)
  })

  it('download_update stores version alongside bytes in DownloadedPackage', () => {
    const body = extractRustFnBody(updaterSource, 'pub async fn download_update')
    expect(body).toBeTruthy()
    expect(body).toContain('DownloadedPackage')
    expect(body).toContain('downloaded_version')
  })

  it('apply_update compares cached version against remote version before install', () => {
    const body = extractRustFnBody(updaterSource, 'pub async fn apply_update')
    expect(body).toBeTruthy()
    // Must reference both the cached version and the update version in a comparison
    expect(body).toContain('downloaded_version')
    expect(body).toContain('update.version')
  })

  it('apply_update preserves cache on version mismatch (puts package back)', () => {
    const body = extractRustFnBody(updaterSource, 'pub async fn apply_update')
    expect(body).toBeTruthy()
    // The version-mismatch branch must reassign Some(...) back to the guard
    // to preserve the downloaded bytes for retry
    expect(body).toMatch(/Some\(cached\)/)
  })
})
