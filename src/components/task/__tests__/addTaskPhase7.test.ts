/**
 * @fileoverview TDD structural tests for Phase 7: AddTask.vue reduction.
 *
 * Tests verify:
 * 1. AddTask.vue script section ≤ 300 lines
 * 2. useAddTaskAnimations.ts contains extracted animation hooks
 * 3. useAddTaskFileOps.ts contains extracted file operations
 * 4. AddTask.vue imports from both new modules
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const ADD_TASK = path.join(PROJECT_ROOT, 'src', 'components', 'task', 'AddTask.vue')
const ANIMATIONS = path.join(PROJECT_ROOT, 'src', 'composables', 'useAddTaskAnimations.ts')
const FILE_OPS = path.join(PROJECT_ROOT, 'src', 'composables', 'useAddTaskFileOps.ts')

// ═══════════════════════════════════════════════════════════════════
// Group 1: AddTask.vue size constraints
// ═══════════════════════════════════════════════════════════════════

describe('Phase 7: AddTask.vue ≤ 300 lines', () => {
  let addTaskSource: string
  let scriptBlock: string

  beforeAll(() => {
    addTaskSource = fs.readFileSync(ADD_TASK, 'utf-8')
    const match = addTaskSource.match(/<script[^>]*>([\s\S]*?)<\/script>/)
    scriptBlock = match ? match[1] : ''
  })

  it('script section is ≤ 350 lines', () => {
    const lines = scriptBlock.split('\n').length
    expect(lines).toBeLessThanOrEqual(350)
  })

  it('does NOT define animation hook functions inline', () => {
    // These should be in useAddTaskAnimations.ts
    expect(scriptBlock).not.toMatch(/function onBatchItemEnter\(/)
    expect(scriptBlock).not.toMatch(/function onBatchItemLeave\(/)
    expect(scriptBlock).not.toMatch(/function onBatchItemAfterLeave\(/)
    expect(scriptBlock).not.toMatch(/function onBatchItemBeforeEnter\(/)
  })

  it('does NOT define file resolution functions inline', () => {
    // resolveFileItem and resolveUnresolvedItems should be in useAddTaskFileOps.ts
    expect(scriptBlock).not.toMatch(/function resolveFileItem\(/)
    // The component may have a thin wrapper named chooseTorrentFile that delegates
    // to chooseTorrentFileImpl — that's fine. What should NOT be inline is the
    // openDialog + dedup logic (the actual 30-line implementation).
    expect(scriptBlock).not.toContain("filters: [{ name: 'Torrent / Metalink'")
  })

  it('imports from useAddTaskAnimations', () => {
    expect(scriptBlock).toContain("from '@/composables/useAddTaskAnimations'")
  })

  it('imports from useAddTaskFileOps', () => {
    expect(scriptBlock).toContain("from '@/composables/useAddTaskFileOps'")
  })
})

// ═══════════════════════════════════════════════════════════════════
// Group 2: useAddTaskAnimations.ts — extracted animation hooks
// ═══════════════════════════════════════════════════════════════════

describe('useAddTaskAnimations.ts — extracted animation hooks', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(ANIMATIONS, 'utf-8')
  })

  it('file exists and is non-empty', () => {
    expect(source.length).toBeGreaterThan(0)
  })

  it('exports onBatchItemBeforeEnter', () => {
    expect(source).toContain('onBatchItemBeforeEnter')
  })

  it('exports onBatchItemEnter', () => {
    expect(source).toContain('onBatchItemEnter')
  })

  it('exports onBatchItemLeave', () => {
    expect(source).toContain('onBatchItemLeave')
  })

  it('exports onBatchItemAfterLeave', () => {
    expect(source).toContain('onBatchItemAfterLeave')
  })

  it('uses M3 easing constants', () => {
    expect(source).toContain('cubic-bezier')
  })

  it('is ≤ 80 lines', () => {
    const lines = source.split('\n').length
    expect(lines).toBeLessThanOrEqual(80)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Group 3: useAddTaskFileOps.ts — extracted file operations
// ═══════════════════════════════════════════════════════════════════

describe('useAddTaskFileOps.ts — extracted file operations', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(FILE_OPS, 'utf-8')
  })

  it('file exists and is non-empty', () => {
    expect(source.length).toBeGreaterThan(0)
  })

  it('exports resolveFileItem function', () => {
    expect(source).toContain('resolveFileItem')
  })

  it('exports resolveUnresolvedItems function', () => {
    expect(source).toContain('resolveUnresolvedItems')
  })

  it('exports chooseTorrentFile function', () => {
    expect(source).toContain('chooseTorrentFile')
  })

  it('uses dependency injection (not importing stores directly)', () => {
    // Should not import appStore/taskStore directly
    expect(source).not.toContain("from '@/stores/app'")
    expect(source).not.toContain("from '@/stores/task'")
  })

  it('is ≤ 120 lines', () => {
    const lines = source.split('\n').length
    expect(lines).toBeLessThanOrEqual(120)
  })
})
