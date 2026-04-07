/** @fileoverview Composable for batch deletion of download records with optional local file removal.
 *
 * Pure utility functions for testability:
 * - buildFilePaths: construct full paths from dir + name
 * - deleteLocalFiles: attempt to trash files with error resilience
 */
import { join } from '@tauri-apps/api/path'
import { trashPath } from '@/composables/useFileDelete'
import { logger } from '@shared/logger'

/** Construct full file paths from directory + filename pairs (platform-safe). */
export async function buildFilePaths(items: Array<{ dir: string; name: string }>): Promise<string[]> {
  const valid = items.filter((item) => item.dir && item.name)
  return Promise.all(valid.map((item) => join(item.dir, item.name)))
}

/** Attempt to move local files to the OS trash. Errors are logged, not thrown. */
export async function deleteLocalFiles(paths: string[]): Promise<{ deleted: number; errors: number }> {
  let deleted = 0
  let errors = 0

  for (const path of paths) {
    try {
      const ok = await trashPath(path)
      if (ok) deleted++
    } catch (e) {
      errors++
      logger.warn('deleteLocalFiles', `Failed to trash ${path}: ${e}`)
    }
  }

  return { deleted, errors }
}
