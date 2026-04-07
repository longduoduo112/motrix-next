/** @fileoverview TDD tests for the batch delete composable.
 *
 * Tests the pure logic for batch and single record deletion with
 * optional local file removal via OS trash.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Tauri FS — readDir still uses plugin-fs (not used by batch delete, but needed for useFileDelete)
const mockRemove = vi.fn()
const mockReadDir = vi.fn()
vi.mock('@tauri-apps/plugin-fs', () => ({
  remove: (...args: unknown[]) => mockRemove(...args),
  readDir: (...args: unknown[]) => mockReadDir(...args),
}))

// Mock Tauri invoke — routes check_path_exists and trash_file to separate handlers
const mockCheckPathExists = vi.fn()
const mockTrashFile = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'check_path_exists') return mockCheckPathExists(args)
    if (cmd === 'trash_file') return mockTrashFile(args)
    return Promise.reject(new Error(`Unexpected invoke: ${cmd}`))
  },
}))

// Mock Tauri path — join uses OS-native separator, mock with /
vi.mock('@tauri-apps/api/path', () => ({
  join: (...parts: string[]) => Promise.resolve(parts.join('/')),
}))

const { deleteLocalFiles, buildFilePaths } = await import('../useBatchDelete')

describe('useBatchDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── buildFilePaths ──────────────────────────────────────────────

  describe('buildFilePaths', () => {
    it('combines dir and name into full path', async () => {
      const paths = await buildFilePaths([
        { dir: '/downloads', name: 'video.mp4' },
        { dir: '/downloads/sub', name: 'file.zip' },
      ])
      expect(paths).toEqual(['/downloads/video.mp4', '/downloads/sub/file.zip'])
    })

    it('returns empty array for empty input', async () => {
      expect(await buildFilePaths([])).toEqual([])
    })

    it('skips entries with missing dir or name', async () => {
      const paths = await buildFilePaths([
        { dir: '/downloads', name: 'valid.zip' },
        { dir: '', name: 'no-dir.zip' },
        { dir: '/downloads', name: '' },
      ])
      expect(paths).toEqual(['/downloads/valid.zip'])
    })
  })

  // ── deleteLocalFiles ────────────────────────────────────────────

  describe('deleteLocalFiles', () => {
    it('trashes files that exist', async () => {
      mockCheckPathExists.mockResolvedValue(true)
      mockTrashFile.mockResolvedValue(undefined)

      const { deleted, errors } = await deleteLocalFiles(['/downloads/a.zip', '/downloads/b.zip'])

      expect(deleted).toBe(2)
      expect(errors).toBe(0)
      expect(mockTrashFile).toHaveBeenCalledTimes(2)
    })

    it('skips files that do not exist', async () => {
      // First file exists → trashed; second file doesn't exist → trashPath returns false
      mockCheckPathExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      mockTrashFile.mockResolvedValue(undefined)

      const { deleted, errors } = await deleteLocalFiles(['/downloads/a.zip', '/downloads/gone.zip'])

      expect(deleted).toBe(1)
      expect(errors).toBe(0)
      // trash_file only called for the existing file
      expect(mockTrashFile).toHaveBeenCalledTimes(1)
    })

    it('counts failures silently (trashPath handles errors internally)', async () => {
      // First file: exists but trash fails → trashPath logs & returns false
      // Second file: exists and trash succeeds → trashPath returns true
      mockCheckPathExists.mockResolvedValue(true)
      mockTrashFile.mockRejectedValueOnce(new Error('perm denied')).mockResolvedValueOnce(undefined)

      const { deleted, errors } = await deleteLocalFiles(['/downloads/locked.zip', '/downloads/ok.zip'])

      // Only the second file is counted as deleted; first failure is logged by trashPath
      expect(deleted).toBe(1)
      expect(errors).toBe(0)
    })

    it('handles empty file list', async () => {
      const { deleted, errors } = await deleteLocalFiles([])
      expect(deleted).toBe(0)
      expect(errors).toBe(0)
    })
  })
})
