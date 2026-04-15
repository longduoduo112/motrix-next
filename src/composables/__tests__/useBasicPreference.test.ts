/**
 * @fileoverview Tests for useBasicPreference pure functions.
 *
 * Key business logic:
 * - btAutoDownloadContent ↔ followTorrent/followMetalink/pauseMetadata
 * - split and maxConnectionPerServer are independent (v2 decoupling)
 * - Defaults must match ENGINE_DEFAULT_SPLIT / ENGINE_DEFAULT_CONNECTION_PER_SERVER
 */
import { describe, it, expect } from 'vitest'
import { buildBasicForm, buildBasicSystemConfig, transformBasicForStore, type BasicForm } from '../useBasicPreference'
import type { AppConfig } from '@shared/types'
import {
  DEFAULT_APP_CONFIG,
  buildDefaultCategories,
  ENGINE_DEFAULT_CONNECTION_PER_SERVER,
  ENGINE_DEFAULT_SPLIT,
  ENGINE_DEFAULT_BT_MAX_PEERS,
} from '@shared/constants'

// ── buildBasicForm ──────────────────────────────────────────────────

describe('buildBasicForm', () => {
  const emptyConfig = {} as AppConfig

  it('returns sensible defaults for empty config', () => {
    const form = buildBasicForm(emptyConfig)
    expect(form.autoCheckUpdate).toBe(true)
    expect(form.autoCheckUpdateInterval).toBe(24)
    expect(form.updateChannel).toBe('stable')
    expect(form.locale).toBe('en-US')
    expect(form.theme).toBe('auto')
    expect(form.maxConcurrentDownloads).toBe(5)
    expect(form.maxConnectionPerServer).toBe(ENGINE_DEFAULT_CONNECTION_PER_SERVER)
    expect(form.keepSeeding).toBe(false)
    expect(form.seedRatio).toBe(2)
    expect(form.seedTime).toBe(2880)
    expect(form.continue).toBe(true)
  })

  it('defaults btAutoDownloadContent to false (pause-metadata=true for file selection)', () => {
    const form = buildBasicForm(emptyConfig)
    expect(form.btAutoDownloadContent).toBe(false)
  })

  it('uses defaultDir when config.dir is empty', () => {
    const form = buildBasicForm(emptyConfig, '~/Downloads')
    expect(form.dir).toBe('~/Downloads')
  })

  it('prefers config.dir over defaultDir', () => {
    const form = buildBasicForm({ dir: '/custom' } as AppConfig, '~/Downloads')
    expect(form.dir).toBe('/custom')
  })

  it('sets btAutoDownloadContent=true when follow=true and pause=false', () => {
    const form = buildBasicForm({
      followTorrent: true,
      followMetalink: true,
      pauseMetadata: false,
    } as unknown as AppConfig)
    expect(form.btAutoDownloadContent).toBe(true)
  })

  it('sets btAutoDownloadContent=false when followTorrent=false', () => {
    const form = buildBasicForm({
      followTorrent: false,
      followMetalink: true,
      pauseMetadata: false,
    } as unknown as AppConfig)
    expect(form.btAutoDownloadContent).toBe(false)
  })

  it('sets btAutoDownloadContent=false when pauseMetadata=true', () => {
    const form = buildBasicForm({
      followTorrent: true,
      followMetalink: true,
      pauseMetadata: true,
    } as unknown as AppConfig)
    expect(form.btAutoDownloadContent).toBe(false)
  })

  it('handles theme undefined → auto', () => {
    const form = buildBasicForm({ theme: undefined } as unknown as AppConfig)
    expect(form.theme).toBe('auto')
  })

  it('preserves theme null → auto via nullish coalescing', () => {
    const form = buildBasicForm({ theme: null } as unknown as AppConfig)
    expect(form.theme).toBe('auto')
  })

  it('formats speed limits as strings', () => {
    const form = buildBasicForm({
      maxOverallDownloadLimit: 1024,
      maxOverallUploadLimit: 512,
    } as unknown as AppConfig)
    expect(form.maxOverallDownloadLimit).toBe('1024')
    expect(form.maxOverallUploadLimit).toBe('512')
  })

  it('defaults maxConnectionPerServer to ENGINE_DEFAULT_CONNECTION_PER_SERVER', () => {
    const form = buildBasicForm({} as AppConfig)
    expect(form.maxConnectionPerServer).toBe(ENGINE_DEFAULT_CONNECTION_PER_SERVER)
  })

  it('DEFAULT_APP_CONFIG.maxConnectionPerServer matches ENGINE_DEFAULT_CONNECTION_PER_SERVER', () => {
    expect(DEFAULT_APP_CONFIG.maxConnectionPerServer).toBe(ENGINE_DEFAULT_CONNECTION_PER_SERVER)
  })

  it('DEFAULT_APP_CONFIG.split matches ENGINE_DEFAULT_SPLIT', () => {
    expect(DEFAULT_APP_CONFIG.split).toBe(ENGINE_DEFAULT_SPLIT)
  })

  it('defaults split to ENGINE_DEFAULT_SPLIT', () => {
    const form = buildBasicForm({} as AppConfig)
    expect(form.split).toBe(ENGINE_DEFAULT_SPLIT)
  })

  it('DEFAULT_APP_CONFIG.btMaxPeers matches ENGINE_DEFAULT_BT_MAX_PEERS', () => {
    expect(DEFAULT_APP_CONFIG.btMaxPeers).toBe(ENGINE_DEFAULT_BT_MAX_PEERS)
  })

  it('defaults btMaxPeers to ENGINE_DEFAULT_BT_MAX_PEERS', () => {
    const form = buildBasicForm({} as AppConfig)
    expect(form.btMaxPeers).toBe(ENGINE_DEFAULT_BT_MAX_PEERS)
  })
})

// ── buildBasicSystemConfig ──────────────────────────────────────────

describe('buildBasicSystemConfig', () => {
  const baseForm: BasicForm = {
    autoCheckUpdate: true,
    autoCheckUpdateInterval: 24,
    updateChannel: 'stable',
    dir: '/downloads',
    locale: 'en-US',
    theme: 'auto',
    colorScheme: 'amber',
    openAtLogin: false,
    keepWindowState: false,
    resumeAllWhenAppLaunched: false,
    autoHideWindow: false,
    minimizeToTrayOnClose: false,
    hideDockOnMinimize: false,
    lightweightMode: false,
    showProgressBar: false,
    traySpeedometer: false,
    dockBadgeSpeed: true,
    taskNotification: true,
    newTaskShowDownloading: true,
    noConfirmBeforeDeleteTask: false,
    deleteFilesWhenSkipConfirm: false,
    maxConcurrentDownloads: 5,
    maxConnectionPerServer: 64,
    split: 64,
    btMaxPeers: 128,
    maxOverallDownloadLimit: '0',
    maxOverallUploadLimit: '0',
    speedScheduleEnabled: false,
    speedScheduleFrom: '08:00',
    speedScheduleTo: '18:00',
    speedScheduleDays: 0,
    btAutoDownloadContent: true,
    btForceEncryption: false,
    keepSeeding: true,
    seedRatio: 1,
    seedTime: 60,
    continue: true,
    remoteTime: true,
    deleteTorrentAfterComplete: false,
    autoDeleteStaleRecords: false,
    clearCompletedOnExit: false,
    fileCategoryEnabled: false,
    fileCategories: buildDefaultCategories('/downloads'),
    clipboardEnable: true,
    clipboardHttp: true,
    clipboardFtp: true,
    clipboardMagnet: true,
    clipboardThunder: true,
    clipboardBtHash: true,
    protocolMagnet: true,
    protocolThunder: false,
    protocolMotrixnext: true,
  }

  it('maps all required aria2 config keys', () => {
    const config = buildBasicSystemConfig(baseForm)
    expect(config.dir).toBe('/downloads')
    expect(config['max-concurrent-downloads']).toBe('5')
    expect(config['max-connection-per-server']).toBe('64')
    expect(config['seed-ratio']).toBe('1')
    expect(config['seed-time']).toBe('60')
    expect(config.continue).toBe('true')
  })

  it('emits split independently from maxConnectionPerServer', () => {
    const config = buildBasicSystemConfig({ ...baseForm, maxConnectionPerServer: 32, split: 128 })
    expect(config.split).toBe('128')
    expect(config['max-connection-per-server']).toBe('32')
  })

  it('always includes both split and max-connection-per-server', () => {
    const config = buildBasicSystemConfig(baseForm)
    expect(config).toHaveProperty('split')
    expect(config).toHaveProperty('max-connection-per-server')
    expect(config.split).toBe(String(baseForm.split))
    expect(config['max-connection-per-server']).toBe(String(baseForm.maxConnectionPerServer))
  })

  it('sets follow-torrent=true and pause-metadata=false when auto-content ON', () => {
    const config = buildBasicSystemConfig({ ...baseForm, btAutoDownloadContent: true })
    expect(config['follow-torrent']).toBe('true')
    expect(config['follow-metalink']).toBe('true')
    expect(config['pause-metadata']).toBe('false')
  })

  it('sets follow-torrent=false and pause-metadata=true when auto-content OFF', () => {
    const config = buildBasicSystemConfig({ ...baseForm, btAutoDownloadContent: false })
    expect(config['follow-torrent']).toBe('false')
    expect(config['follow-metalink']).toBe('false')
    expect(config['pause-metadata']).toBe('true')
  })

  it('always includes bt-save-metadata=true and bt-load-saved-metadata=true', () => {
    const config = buildBasicSystemConfig(baseForm)
    expect(config['bt-save-metadata']).toBe('true')
    expect(config['bt-load-saved-metadata']).toBe('true')
  })

  // ── force-save isolation: global config must NOT include force-save ──
  // aria2's SessionSerializer.cc:288 saves FINISHED tasks to the session file
  // ONLY when the per-download option force-save=true is set. Setting it
  // globally causes ALL completed downloads (HTTP + BT) to persist in the
  // session, making aria2 re-download them on restart.
  //
  // force-save must be a per-download option injected only on BT tasks
  // (addTorrent / addMetalink), never as a global option.

  it('does NOT include force-save in global system config', () => {
    const config = buildBasicSystemConfig(baseForm)
    expect(config).not.toHaveProperty('force-save')
  })

  it('does NOT include force-save regardless of keepSeeding value', () => {
    const withSeeding = buildBasicSystemConfig({ ...baseForm, keepSeeding: true })
    const withoutSeeding = buildBasicSystemConfig({ ...baseForm, keepSeeding: false })
    expect(withSeeding).not.toHaveProperty('force-save')
    expect(withoutSeeding).not.toHaveProperty('force-save')
  })
})

// ── transformBasicForStore ──────────────────────────────────────────

describe('transformBasicForStore', () => {
  const baseForm: BasicForm = {
    autoCheckUpdate: true,
    autoCheckUpdateInterval: 24,
    updateChannel: 'stable',
    dir: '/dl',
    locale: 'en-US',
    theme: 'auto',
    colorScheme: 'amber',
    openAtLogin: false,
    keepWindowState: false,
    resumeAllWhenAppLaunched: false,
    autoHideWindow: false,
    minimizeToTrayOnClose: false,
    hideDockOnMinimize: false,
    lightweightMode: false,
    showProgressBar: false,
    traySpeedometer: false,
    dockBadgeSpeed: true,
    taskNotification: true,
    newTaskShowDownloading: true,
    noConfirmBeforeDeleteTask: false,
    deleteFilesWhenSkipConfirm: false,
    maxConcurrentDownloads: 5,
    maxConnectionPerServer: 16,
    split: 16,
    btMaxPeers: 128,
    maxOverallDownloadLimit: '0',
    maxOverallUploadLimit: '0',
    speedScheduleEnabled: false,
    speedScheduleFrom: '08:00',
    speedScheduleTo: '18:00',
    speedScheduleDays: 0,
    btAutoDownloadContent: true,
    btForceEncryption: false,
    keepSeeding: true,
    seedRatio: 1,
    seedTime: 60,
    continue: true,
    remoteTime: true,
    deleteTorrentAfterComplete: false,
    autoDeleteStaleRecords: false,
    clearCompletedOnExit: false,
    fileCategoryEnabled: false,
    fileCategories: buildDefaultCategories('/downloads'),
    clipboardEnable: true,
    clipboardHttp: true,
    clipboardFtp: true,
    clipboardMagnet: true,
    clipboardThunder: true,
    clipboardBtHash: true,
    protocolMagnet: true,
    protocolThunder: false,
    protocolMotrixnext: true,
  }

  it('expands btAutoDownloadContent=true into follow+resume', () => {
    const result = transformBasicForStore({ ...baseForm, btAutoDownloadContent: true })
    expect(result.followTorrent).toBe(true)
    expect(result.followMetalink).toBe(true)
    expect(result.pauseMetadata).toBe(false)
    expect((result as Record<string, unknown>).btAutoDownloadContent).toBeUndefined()
  })

  it('expands btAutoDownloadContent=false into stop+pause', () => {
    const result = transformBasicForStore({ ...baseForm, btAutoDownloadContent: false })
    expect(result.followTorrent).toBe(false)
    expect(result.followMetalink).toBe(false)
    expect(result.pauseMetadata).toBe(true)
    expect((result as Record<string, unknown>).btAutoDownloadContent).toBeUndefined()
  })

  it('removes btAutoDownloadContent from output', () => {
    const result = transformBasicForStore(baseForm)
    expect('btAutoDownloadContent' in result).toBe(false)
  })

  it('persists split independently from maxConnectionPerServer', () => {
    const result = transformBasicForStore({ ...baseForm, maxConnectionPerServer: 32, split: 128 })
    expect(result.split).toBe(128)
    expect(result.maxConnectionPerServer).toBe(32)
  })

  it('does not set engineMaxConnectionPerServer (removed in v2)', () => {
    const result = transformBasicForStore({ ...baseForm, maxConnectionPerServer: 32 })
    expect((result as Record<string, unknown>).engineMaxConnectionPerServer).toBeUndefined()
  })
})
