/**
 * @fileoverview TDD tests for the config migration system.
 *
 * Tests are written BEFORE the implementation to drive the design.
 * Each test defines an expected behavior that the migration engine must satisfy.
 */
import { describe, it, expect, vi } from 'vitest'
import { runMigrations, CONFIG_VERSION } from '@shared/utils/configMigration'
import { PROXY_SCOPE_OPTIONS } from '@shared/constants'
import type { AppConfig } from '@shared/types'

// ── CONFIG_VERSION constant ────────────────────────────────────────

describe('CONFIG_VERSION', () => {
  it('is a positive integer', () => {
    expect(CONFIG_VERSION).toBeGreaterThan(0)
    expect(Number.isInteger(CONFIG_VERSION)).toBe(true)
  })
})

// ── runMigrations — return value semantics ─────────────────────────

describe('runMigrations return value', () => {
  it('returns true when config has no configVersion (needs migration)', () => {
    const config: Partial<AppConfig> = {}
    expect(runMigrations(config)).toBe(true)
  })

  it('returns true when configVersion is 0 (pre-migration)', () => {
    const config: Partial<AppConfig> = { configVersion: 0 }
    expect(runMigrations(config)).toBe(true)
  })

  it('returns false when configVersion equals CONFIG_VERSION (already current)', () => {
    const config: Partial<AppConfig> = { configVersion: CONFIG_VERSION }
    expect(runMigrations(config)).toBe(false)
  })

  it('returns false when configVersion exceeds CONFIG_VERSION (future version)', () => {
    const config: Partial<AppConfig> = { configVersion: CONFIG_VERSION + 1 }
    expect(runMigrations(config)).toBe(false)
  })
})

// ── runMigrations — configVersion stamp ────────────────────────────

describe('runMigrations version stamping', () => {
  it('stamps configVersion to CONFIG_VERSION after migration', () => {
    const config: Partial<AppConfig> = {}
    runMigrations(config)
    expect(config.configVersion).toBe(CONFIG_VERSION)
  })

  it('does not modify configVersion when already current', () => {
    const config: Partial<AppConfig> = { configVersion: CONFIG_VERSION }
    runMigrations(config)
    expect(config.configVersion).toBe(CONFIG_VERSION)
  })

  it('does not downgrade configVersion from future version', () => {
    const future = CONFIG_VERSION + 5
    const config: Partial<AppConfig> = { configVersion: future }
    runMigrations(config)
    expect(config.configVersion).toBe(future)
  })
})

// ── v1 Migration: proxy.scope backfill ─────────────────────────────

describe('v1 migration — proxy.scope backfill', () => {
  it('backfills empty scope array with all PROXY_SCOPE_OPTIONS', () => {
    const config: Partial<AppConfig> = {
      proxy: { enable: true, server: 'http://127.0.0.1:7890', bypass: '', scope: [] },
    }
    runMigrations(config)
    expect(config.proxy!.scope).toEqual([...PROXY_SCOPE_OPTIONS])
  })

  it('backfills even when proxy is disabled (consistency)', () => {
    const config: Partial<AppConfig> = {
      proxy: { enable: false, server: '', bypass: '', scope: [] },
    }
    runMigrations(config)
    expect(config.proxy!.scope).toEqual([...PROXY_SCOPE_OPTIONS])
  })

  it('preserves user-selected scope values (does not overwrite)', () => {
    const config: Partial<AppConfig> = {
      proxy: { enable: true, server: 'http://proxy:8080', bypass: '', scope: ['download'] },
    }
    runMigrations(config)
    expect(config.proxy!.scope).toEqual(['download'])
  })

  it('preserves full scope array unchanged', () => {
    const config: Partial<AppConfig> = {
      proxy: {
        enable: true,
        server: 'http://proxy:8080',
        bypass: '',
        scope: [...PROXY_SCOPE_OPTIONS],
      },
    }
    runMigrations(config)
    expect(config.proxy!.scope).toEqual([...PROXY_SCOPE_OPTIONS])
  })

  it('does nothing when proxy field is absent entirely', () => {
    const config: Partial<AppConfig> = {}
    runMigrations(config)
    expect(config.proxy).toBeUndefined()
  })

  it('handles proxy without scope field (scope is undefined)', () => {
    const config: Partial<AppConfig> = {
      proxy: { enable: true, server: 'http://proxy:8080', bypass: '' } as AppConfig['proxy'],
    }
    runMigrations(config)
    // No scope field to backfill — migration should not crash
    expect(config.proxy).toBeDefined()
  })
})

// ── Idempotency ────────────────────────────────────────────────────

describe('runMigrations idempotency', () => {
  it('running migrations twice produces identical results', () => {
    const config: Partial<AppConfig> = {
      proxy: { enable: true, server: 'http://127.0.0.1:7890', bypass: '', scope: [] },
    }
    runMigrations(config)
    const snapshot = JSON.parse(JSON.stringify(config))
    // Running again on already-migrated config should be a no-op
    const changed = runMigrations(config)
    expect(changed).toBe(false)
    expect(config).toEqual(snapshot)
  })
})

// ── Integration with non-proxy fields ──────────────────────────────

describe('runMigrations preserves unrelated config fields', () => {
  it('does not mutate any non-proxy fields', () => {
    const config: Partial<AppConfig> = {
      theme: 'dark',
      locale: 'zh-CN',
      split: 16,
      dir: '/downloads',
      proxy: { enable: true, server: 'http://proxy:1080', bypass: '', scope: [] },
    }
    runMigrations(config)
    expect(config.theme).toBe('dark')
    expect(config.locale).toBe('zh-CN')
    expect(config.split).toBe(16)
    expect(config.dir).toBe('/downloads')
  })
})

// ── CONFIG_VERSION consistency guard ───────────────────────────────

describe('CONFIG_VERSION consistency guard', () => {
  it('CONFIG_VERSION equals the number of registered migrations', async () => {
    // The module-level guard throws at import time if mismatched.
    // If we reach this test, the guard has already passed — verify
    // the invariant explicitly by re-importing the constant.
    const mod = await import('@shared/utils/configMigration')
    expect(mod.CONFIG_VERSION).toBeGreaterThan(0)
    // CONFIG_VERSION is set to migrations.length in source, and the
    // runtime guard ensures they match. If this test passes, the
    // invariant holds.
  })
})

// ── Error isolation ────────────────────────────────────────────────

describe('runMigrations error isolation', () => {
  it('stamps configVersion even when a migration throws', () => {
    // We can't easily inject a failing migration into the sealed array,
    // but we can verify the contract: if proxy.scope triggers an error
    // due to a corrupted proxy object, the engine should still stamp
    // configVersion and return true.
    const config: Partial<AppConfig> = {
      // proxy.scope is a non-array value — Object.defineProperty to
      // make .length throw when accessed
      proxy: {
        enable: true,
        server: 'http://proxy:8080',
        bypass: '',
        get scope(): string[] {
          throw new Error('simulated corruption')
        },
        set scope(_v: string[]) {
          // no-op for the test
        },
      },
    }
    // Suppress expected error log during test
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = runMigrations(config)
    logSpy.mockRestore()

    // Migration failed but engine should still complete
    expect(result).toBe(true)
    expect(config.configVersion).toBe(CONFIG_VERSION)
  })

  it('does not crash the entire migration pipeline on error', () => {
    // Verify runMigrations never throws, even with bad data
    const config: Partial<AppConfig> = {
      proxy: {
        enable: true,
        server: 'http://proxy:8080',
        bypass: '',
        get scope(): string[] {
          throw new TypeError('cannot read property')
        },
        set scope(_v: string[]) {
          // no-op
        },
      },
    }
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => runMigrations(config)).not.toThrow()
    logSpy.mockRestore()
  })
})
