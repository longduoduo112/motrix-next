/** @fileoverview Composable for deleting download task files and associated artifacts from disk.
 *
 * All user-facing file deletions go through `trashPath()` which moves files to
 * the OS trash / recycle bin via the Rust `trash_file` command.  This provides
 * a recoverable delete experience across all three platforms:
 * - macOS:  NSFileManager.trashItemAtURL
 * - Windows: IFileOperation + FOFX_RECYCLEONDELETE
 * - Linux:  FreeDesktop Trash spec (XDG_DATA_HOME/Trash)
 *
 * Empty directory cleanup uses permanent removal (no value in trashing empty dirs).
 */
import { remove, readDir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { invoke } from '@tauri-apps/api/core'
import { logger } from '@shared/logger'
import { getTaskName } from '@shared/utils'
import type { Aria2Task } from '@shared/types'

/**
 * Move a file or directory to the OS trash / recycle bin.
 *
 * Silent no-op when the path is empty, doesn't exist, or the operation fails.
 * Returns `true` if the item was successfully trashed.
 */
export async function trashPath(path: string): Promise<boolean> {
  if (!path) return false
  try {
    const exists = await invoke<boolean>('check_path_exists', { path })
    if (!exists) return false
    await invoke('trash_file', { path })
    return true
  } catch (e) {
    logger.debug('trashPath', `Failed to trash ${path}: ${e}`)
    return false
  }
}

/**
 * Safely removes a directory only if it is empty.
 * Returns true if the directory was removed, false otherwise.
 *
 * Uses permanent removal — trashing empty folders adds no user value.
 */
async function removeIfEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await readDir(dirPath)
    if (entries.length === 0) {
      await remove(dirPath)
      return true
    }
  } catch (e) {
    logger.debug('deleteTaskFiles.removeIfEmpty', e)
  }
  return false
}

/**
 * Moves all files associated with a download task to the OS trash, including:
 * - Each file referenced by the task
 * - Companion .aria2 control files
 * - Empty parent directories (permanently removed, not trashed)
 * - The named task directory itself (only if empty after file removal)
 *
 * Safety: directories are only removed when empty to prevent accidental
 * deletion of unrelated files in shared download directories.
 */
export async function deleteTaskFiles(task: Aria2Task): Promise<void> {
  const dir = task.dir
  const files = task.files || []
  const parentDirs = new Set<string>()

  for (const f of files) {
    if (!f.path) continue
    await trashPath(f.path)
    await trashPath(f.path + '.aria2')
    const lastSep = Math.max(f.path.lastIndexOf('/'), f.path.lastIndexOf('\\'))
    if (lastSep > 0) {
      const parent = f.path.substring(0, lastSep)
      if (parent !== dir) parentDirs.add(parent)
    }
  }

  // Only remove parent directories if they are now empty
  for (const pd of parentDirs) {
    await removeIfEmpty(pd)
  }

  // Only remove the task directory if it exists and is now empty
  if (dir) {
    const name = getTaskName(task, { defaultName: '' })
    if (name) {
      const taskDir = await join(dir, name)
      await removeIfEmpty(taskDir)
    }
  }
}
