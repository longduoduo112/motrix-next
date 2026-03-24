/**
 * @fileoverview Config schema migration engine.
 *
 * Tauri's plugin-store has no built-in migration API, so we implement
 * the industry-standard versioned-migration pattern (as used by
 * electron-store, VS Code, Obsidian, etc.):
 *
 *   1. Store a `configVersion` integer alongside user preferences.
 *   2. On each app launch, compare stored version against CONFIG_VERSION.
 *   3. Execute any pending migration functions in order.
 *   4. Stamp the new version and persist.
 *
 * Adding a new migration:
 *   1. Append a function to the `migrations` array.
 *   2. Increment CONFIG_VERSION to match the new array length.
 *   3. Add tests in configMigration.test.ts.
 */

import { PROXY_SCOPE_OPTIONS } from '@shared/constants'
import { logger } from '@shared/logger'
import type { AppConfig } from '@shared/types'

/** Current schema version. Must equal `migrations.length`. */
export const CONFIG_VERSION = 1

type Migration = (config: Partial<AppConfig>) => void

/**
 * Ordered list of migration functions. Index 0 migrates v0 → v1, etc.
 *
 * Invariants:
 *   - Each migration mutates the config object in place.
 *   - Each migration MUST be idempotent — safe to re-run on
 *     already-migrated data (e.g. a non-empty scope is left untouched).
 *   - Migrations MUST NOT delete user data without logging.
 */
const migrations: Migration[] = [
  // ── v0 → v1 ──────────────────────────────────────────────────────
  // Backfill empty proxy.scope for users who configured proxy before
  // the scope feature was introduced (pre-#81). Without scope values,
  // buildAdvancedSystemConfig() emits all-proxy='' and aria2 receives
  // no proxy configuration, causing Bug #103.
  //
  // Empty scope is treated as "never explicitly configured" rather than
  // "user intentionally deselected all scopes", because the scope UI
  // did not exist when these users saved their proxy settings.
  function migrateV1(config: Partial<AppConfig>): void {
    const proxy = config.proxy
    if (!proxy || !Array.isArray(proxy.scope)) return
    if (proxy.scope.length === 0) {
      proxy.scope = [...PROXY_SCOPE_OPTIONS]
      logger.info('ConfigMigration', 'v1: backfilled empty proxy.scope with all scope options')
    }
  },
]

// ── Consistency guard ───────────────────────────────────────────────
// Fail fast at import time if a developer adds a migration but forgets
// to bump CONFIG_VERSION (or vice versa). This is caught by both
// vitest and vite dev/build — never reaches production silently.
if (CONFIG_VERSION !== migrations.length) {
  throw new Error(
    `CONFIG_VERSION (${CONFIG_VERSION}) must equal migrations.length (${migrations.length}). ` +
      'Did you forget to bump CONFIG_VERSION after adding a migration?',
  )
}

/**
 * Executes all pending migrations on the given config object.
 *
 * Each migration is wrapped in a try-catch so that a failure in one
 * migration does not prevent subsequent migrations from executing.
 * The config is always stamped to CONFIG_VERSION after the loop,
 * ensuring partially-migrated configs are not re-processed.
 *
 * @param config - Mutable reference to the loaded user preferences.
 * @returns `true` if any migration was applied (caller must persist),
 *          `false` if the config is already at the current version.
 */
export function runMigrations(config: Partial<AppConfig>): boolean {
  const stored = (config.configVersion as number | undefined) ?? 0

  if (stored >= CONFIG_VERSION) return false

  for (let i = stored; i < migrations.length; i++) {
    try {
      migrations[i](config)
    } catch (e) {
      // Log and continue — don't let one broken migration block the rest.
      // The config will still be stamped to CONFIG_VERSION to prevent
      // re-running the failed migration on every subsequent launch.
      logger.error('ConfigMigration', `v${i + 1} migration failed: ${(e as Error).message}`)
    }
  }

  config.configVersion = CONFIG_VERSION
  return true
}
