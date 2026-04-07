/** @fileoverview Utilities for download cleanup: stale record detection and torrent file removal.
 *
 * Pure, testable functions — side effects (FS access) are injected via imports.
 */
import { readDir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { invoke } from '@tauri-apps/api/core'
import { trashPath } from '@/composables/useFileDelete'
import { logger } from '@shared/logger'

/** Record shape needed for stale detection (not the full HistoryRecord). */
export interface StaleCheckItem {
  gid: string
  dir: string
  name: string
  /** All file paths from meta.files — if present, ALL must be gone to count as stale. */
  filePaths?: string[]
}

/** Identify records whose downloaded files no longer exist on disk.
 *  Returns the GIDs of stale records. */
export async function findStaleRecords(records: StaleCheckItem[]): Promise<string[]> {
  const staleGids: string[] = []

  for (const record of records) {
    // Multi-file: only stale if ALL expected files are gone.
    // Early-exit on first existing file for performance.
    if (record.filePaths && record.filePaths.length > 0) {
      let anyExists = false
      for (const fp of record.filePaths) {
        try {
          if (await invoke<boolean>('check_path_exists', { path: fp })) {
            anyExists = true
            break
          }
        } catch {
          // Treat errors as non-existent
        }
      }
      if (!anyExists) staleGids.push(record.gid)
      continue
    }

    // Legacy single-file fallback (unchanged)
    if (!record.dir || !record.name) {
      staleGids.push(record.gid)
      continue
    }

    try {
      const filePath = await join(record.dir, record.name)
      const fileExists = await invoke<boolean>('check_path_exists', { path: filePath })
      if (!fileExists) {
        staleGids.push(record.gid)
      }
    } catch {
      staleGids.push(record.gid)
    }
  }

  return staleGids
}

/** Move a torrent source file to the OS trash / recycle bin.
 *  Returns true on success, false if the file doesn't exist or the operation fails. */
export async function trashTorrentFile(path: string): Promise<boolean> {
  if (!path) return false

  try {
    const fileExists = await invoke<boolean>('check_path_exists', { path })
    if (!fileExists) return false

    await invoke('trash_file', { path })
    return true
  } catch (e) {
    logger.warn('trashTorrentFile', `Failed to trash ${path}: ${e}`)
    return false
  }
}

/** Check whether the "delete torrent after complete" setting is enabled. */
export function shouldDeleteTorrent(config: Partial<{ deleteTorrentAfterComplete: boolean }>): boolean {
  return config.deleteTorrentAfterComplete === true
}

/** Regex matching aria2's auto-saved metadata filenames: 40-char lowercase hex + .torrent */
const HEX40_TORRENT_RE = /^[0-9a-f]{40}\.torrent$/

/**
 * Default hash extractor: reads a .torrent file, parses it with bencode,
 * and computes the SHA-1 infoHash.  Used in production; tests inject a mock.
 */
async function defaultHashExtractor(filePath: string): Promise<string | null> {
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const bencode = (await import('bencode')).default
  const bytes = await readFile(filePath)
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const decoded = bencode.decode(uint8) as Record<string, unknown>
  const info = decoded.info as Record<string, unknown> | undefined
  if (!info) return null
  const infoBytes = bencode.encode(info)
  const hashBuffer = await crypto.subtle.digest('SHA-1', new Uint8Array(infoBytes).buffer as ArrayBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Type for the injectable hash extractor function. */
export type HashExtractor = (filePath: string) => Promise<string | null>

/**
 * Scan the download directory for aria2-saved .torrent metadata files and
 * delete the one whose infoHash matches the given target.
 *
 * aria2 names metadata files as `{SHA1(uploaded_content)}.torrent` (40-char hex),
 * which is different from the torrent's infoHash.  We must read and parse each
 * candidate to find the match.
 *
 * Safety guarantees:
 * - Only files matching `[0-9a-f]{40}.torrent` are considered (user files safe)
 * - Parsed infoHash must exactly match the target (no accidental deletion)
 * - All errors are caught and logged (never throws)
 *
 * @param dir       Download directory to scan
 * @param infoHash  Target infoHash to match (from aria2 task status)
 * @param extractHash  Injectable hash extractor for testability
 * @returns true if a matching file was found and deleted, false otherwise
 */
export async function cleanupTorrentMetadataFiles(
  dir: string,
  infoHash: string,
  extractHash: HashExtractor = defaultHashExtractor,
): Promise<boolean> {
  if (!dir || !infoHash) return false

  try {
    const entries = await readDir(dir)
    const candidates = entries.filter((e) => e.isFile && HEX40_TORRENT_RE.test(e.name))

    for (const entry of candidates) {
      const filePath = await join(dir, entry.name)
      try {
        const hash = await extractHash(filePath)
        if (hash === infoHash) {
          const trashed = await trashPath(filePath)
          if (trashed) logger.debug('cleanupTorrentMetadata', `trashed ${entry.name}`)
          return trashed
        }
      } catch (e) {
        logger.debug('cleanupTorrentMetadata', `skipping ${entry.name}: ${e}`)
        continue
      }
    }

    return false
  } catch (e) {
    logger.debug('cleanupTorrentMetadata', `readDir failed for ${dir}: ${e}`)
    return false
  }
}
