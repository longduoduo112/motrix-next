/**
 * @fileoverview Structural tests for the extracted useTaskActions composable.
 *
 * useTaskActions encapsulates the 9 task action handler functions that were
 * previously inlined in TaskView.vue. These are structural tests that verify
 * the Rust/Vue source code contracts — reading the source files directly.
 *
 * Test groups:
 * 1. useTaskActions.ts must export useTaskActions
 * 2. useTaskActions must contain all 9 handler functions
 * 3. TaskView.vue must import and delegate to useTaskActions
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')
const TASK_VIEW = path.join(PROJECT_ROOT, 'src', 'views', 'TaskView.vue')
const USE_TASK_ACTIONS = path.join(PROJECT_ROOT, 'src', 'composables', 'useTaskActions.ts')

const EXPECTED_HANDLERS = [
  'handlePauseTask',
  'handleResumeTask',
  'handleDeleteTask',
  'handleDeleteRecord',
  'handleCopyLink',
  'handleShowInfo',
  'handleShowInFolder',
  'handleOpenFile',
  'handleStopSeeding',
] as const

// ═══════════════════════════════════════════════════════════════════
// Group 1: useTaskActions.ts — module structure
// ═══════════════════════════════════════════════════════════════════

describe('useTaskActions.ts — module structure', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(USE_TASK_ACTIONS, 'utf-8')
  })

  it('exports useTaskActions function', () => {
    expect(source).toMatch(/export\s+function\s+useTaskActions/)
  })

  for (const handler of EXPECTED_HANDLERS) {
    it(`defines ${handler}`, () => {
      expect(source).toContain(handler)
    })
  }

  it('returns all handlers from useTaskActions', () => {
    // Extract the return statement block
    const returnIdx = source.lastIndexOf('return {')
    expect(returnIdx).toBeGreaterThan(-1)
    const returnBlock = source.slice(returnIdx, source.indexOf('}', returnIdx) + 1)

    for (const handler of EXPECTED_HANDLERS) {
      expect(returnBlock).toContain(handler)
    }
  })

  it('uses dependency injection (does not hardcode store imports at module level)', () => {
    // The composable should receive stores/i18n as parameters, not import them
    // at the top level. This makes it testable without Pinia setup.
    const beforeExport = source.slice(0, source.indexOf('export function useTaskActions'))
    expect(beforeExport).not.toMatch(/import.*useTaskStore/)
    expect(beforeExport).not.toMatch(/import.*usePreferenceStore/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Group 2: TaskView.vue — delegation to useTaskActions
// ═══════════════════════════════════════════════════════════════════

describe('TaskView.vue — delegates to useTaskActions', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(TASK_VIEW, 'utf-8')
  })

  it('imports useTaskActions', () => {
    expect(source).toMatch(/import.*useTaskActions.*from/)
  })

  it('calls useTaskActions() in script setup', () => {
    expect(source).toContain('useTaskActions(')
  })

  it('no longer defines handlePauseTask inline', () => {
    // After extraction, TaskView.vue should NOT have standalone function
    // definitions for these handlers — they come from the composable.
    expect(source).not.toMatch(/^function handlePauseTask/m)
    expect(source).not.toMatch(/^function handleDeleteTask/m)
    expect(source).not.toMatch(/^function handleDeleteRecord/m)
  })

  it('script block is under 300 lines', () => {
    const scriptStart = source.indexOf('<script')
    const scriptEnd = source.indexOf('</script>')
    const scriptBlock = source.slice(scriptStart, scriptEnd)
    const lineCount = scriptBlock.split('\n').length
    expect(lineCount).toBeLessThanOrEqual(300)
  })
})
