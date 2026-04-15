/**
 * @fileoverview Pure functions extracted from Basic.vue for testability.
 *
 * Contains the basic preference form building and system config transforms.
 * The btAutoDownloadContent ↔ followTorrent/followMetalink/pauseMetadata
 * mapping is the key business logic tested here.
 */
import type { AppConfig, FileCategory } from '@shared/types'
import {
  DEFAULT_APP_CONFIG as D,
  buildDefaultCategories,
  BUILTIN_CATEGORY_LABELS,
  BUILTIN_CATEGORY_TEMPLATES,
} from '@shared/constants'

// ── Types ───────────────────────────────────────────────────────────

export interface BasicForm {
  [key: string]: unknown
  autoCheckUpdate: boolean
  autoCheckUpdateInterval: number
  updateChannel: string
  dir: string
  locale: string
  theme: string
  colorScheme: string
  openAtLogin: boolean
  keepWindowState: boolean

  resumeAllWhenAppLaunched: boolean
  autoHideWindow: boolean
  minimizeToTrayOnClose: boolean
  hideDockOnMinimize: boolean
  lightweightMode: boolean
  showProgressBar: boolean
  traySpeedometer: boolean
  dockBadgeSpeed: boolean
  taskNotification: boolean
  newTaskShowDownloading: boolean
  noConfirmBeforeDeleteTask: boolean
  deleteFilesWhenSkipConfirm: boolean
  maxConcurrentDownloads: number
  maxConnectionPerServer: number
  split: number
  btMaxPeers: number
  maxOverallDownloadLimit: string
  maxOverallUploadLimit: string
  speedScheduleEnabled: boolean
  speedScheduleFrom: string
  speedScheduleTo: string
  speedScheduleDays: number
  btAutoDownloadContent: boolean
  btForceEncryption: boolean
  keepSeeding: boolean
  seedRatio: number
  seedTime: number
  continue: boolean
  remoteTime: boolean
  deleteTorrentAfterComplete: boolean
  autoDeleteStaleRecords: boolean
  clearCompletedOnExit: boolean
  fileCategoryEnabled: boolean
  fileCategories: FileCategory[]
  clipboardEnable: boolean
  clipboardHttp: boolean
  clipboardFtp: boolean
  clipboardMagnet: boolean
  clipboardThunder: boolean
  clipboardBtHash: boolean
  protocolMagnet: boolean
  protocolThunder: boolean
  protocolMotrixnext: boolean
}

// ── Pure Functions ──────────────────────────────────────────────────

/**
 * Hydrates categories loaded from persisted config with missing fields.
 * - `builtIn`: inferred from label matching against BUILTIN_CATEGORY_TEMPLATES
 * - `directory`: filled from baseDir + template subdirName (built-in) or baseDir (custom)
 * Empty directories would cause aria2 to fail, so this is safety-critical.
 */
function hydrateCategories(categories: FileCategory[], baseDir: string): FileCategory[] {
  const normalizedBase = baseDir.replace(/[\\/]+$/, '')
  const templateMap: ReadonlyMap<string, string> = new Map(
    BUILTIN_CATEGORY_TEMPLATES.map((t) => [t.label, t.subdirName]),
  )

  return categories.map((cat) => {
    const isBuiltIn = cat.builtIn ?? BUILTIN_CATEGORY_LABELS.has(cat.label)
    let directory = cat.directory
    if (!directory) {
      const subdirName = templateMap.get(cat.label)
      directory = subdirName ? `${normalizedBase}/${subdirName}` : normalizedBase
    }
    return { ...cat, builtIn: isBuiltIn, directory }
  })
}

/**
 * Builds the basic form state from the preference store config.
 * All fallback values reference DEFAULT_APP_CONFIG (single source of truth).
 * The btAutoDownloadContent field merges three separate config values.
 */
export function buildBasicForm(config: AppConfig, defaultDir: string = ''): BasicForm {
  const followTorrent = config.followTorrent ?? D.followTorrent
  const followMetalink = config.followMetalink ?? D.followMetalink
  const pauseMetadata = config.pauseMetadata ?? D.pauseMetadata
  const btAutoDownloadContent = followTorrent && followMetalink && !pauseMetadata

  return {
    autoCheckUpdate: config.autoCheckUpdate ?? D.autoCheckUpdate,
    autoCheckUpdateInterval: config.autoCheckUpdateInterval ?? D.autoCheckUpdateInterval,
    updateChannel: config.updateChannel ?? D.updateChannel,
    dir: config.dir || defaultDir,
    locale: config.locale || 'en-US',
    theme: config.theme ?? D.theme,
    colorScheme: config.colorScheme ?? D.colorScheme,
    openAtLogin: config.openAtLogin ?? D.openAtLogin,
    keepWindowState: config.keepWindowState ?? D.keepWindowState,

    resumeAllWhenAppLaunched: config.resumeAllWhenAppLaunched ?? D.resumeAllWhenAppLaunched,
    autoHideWindow: config.autoHideWindow ?? D.autoHideWindow,
    minimizeToTrayOnClose: config.minimizeToTrayOnClose ?? D.minimizeToTrayOnClose,
    hideDockOnMinimize: config.hideDockOnMinimize ?? D.hideDockOnMinimize,
    lightweightMode: config.lightweightMode ?? D.lightweightMode,
    showProgressBar: config.showProgressBar ?? D.showProgressBar,
    traySpeedometer: config.traySpeedometer ?? D.traySpeedometer,
    dockBadgeSpeed: config.dockBadgeSpeed ?? D.dockBadgeSpeed,
    taskNotification: config.taskNotification ?? D.taskNotification,
    newTaskShowDownloading: config.newTaskShowDownloading ?? D.newTaskShowDownloading,
    noConfirmBeforeDeleteTask: config.noConfirmBeforeDeleteTask ?? D.noConfirmBeforeDeleteTask,
    deleteFilesWhenSkipConfirm: config.deleteFilesWhenSkipConfirm ?? D.deleteFilesWhenSkipConfirm,
    maxConcurrentDownloads: config.maxConcurrentDownloads ?? D.maxConcurrentDownloads,
    maxConnectionPerServer: config.maxConnectionPerServer ?? D.maxConnectionPerServer,
    split: config.split ?? D.split,
    btMaxPeers: config.btMaxPeers ?? D.btMaxPeers,
    maxOverallDownloadLimit: String(config.maxOverallDownloadLimit ?? D.maxOverallDownloadLimit),
    maxOverallUploadLimit: String(config.maxOverallUploadLimit ?? D.maxOverallUploadLimit),
    speedScheduleEnabled: config.speedScheduleEnabled ?? D.speedScheduleEnabled,
    speedScheduleFrom: config.speedScheduleFrom ?? D.speedScheduleFrom,
    speedScheduleTo: config.speedScheduleTo ?? D.speedScheduleTo,
    speedScheduleDays: config.speedScheduleDays ?? D.speedScheduleDays,
    btAutoDownloadContent,
    btForceEncryption: config.btForceEncryption ?? D.btForceEncryption,
    keepSeeding: config.keepSeeding ?? D.keepSeeding,
    seedRatio: config.seedRatio ?? D.seedRatio,
    seedTime: config.seedTime ?? D.seedTime,
    continue: config.continue ?? D.continue,
    remoteTime: config.remoteTime ?? D.remoteTime,
    deleteTorrentAfterComplete: config.deleteTorrentAfterComplete ?? false,
    autoDeleteStaleRecords: config.autoDeleteStaleRecords ?? false,
    clearCompletedOnExit: config.clearCompletedOnExit ?? false,
    fileCategoryEnabled: config.fileCategoryEnabled ?? D.fileCategoryEnabled,
    fileCategories:
      config.fileCategories && config.fileCategories.length > 0
        ? hydrateCategories(config.fileCategories, config.dir || defaultDir)
        : buildDefaultCategories(config.dir || defaultDir),
    clipboardEnable: config.clipboard?.enable ?? D.clipboard.enable,
    clipboardHttp: config.clipboard?.http ?? D.clipboard.http,
    clipboardFtp: config.clipboard?.ftp ?? D.clipboard.ftp,
    clipboardMagnet: config.clipboard?.magnet ?? D.clipboard.magnet,
    clipboardThunder: config.clipboard?.thunder ?? D.clipboard.thunder,
    clipboardBtHash: config.clipboard?.btHash ?? D.clipboard.btHash,
    protocolMagnet: config.protocols?.magnet ?? D.protocols.magnet,
    protocolThunder: config.protocols?.thunder ?? D.protocols.thunder,
    protocolMotrixnext: config.protocols?.motrixnext ?? D.protocols.motrixnext,
  }
}

/**
 * Converts the basic form into aria2 system config key-value pairs.
 * Handles the btAutoDownloadContent → follow-torrent/follow-metalink/pause-metadata expansion.
 */
export function buildBasicSystemConfig(f: BasicForm): Record<string, string> {
  const autoContent = !!f.btAutoDownloadContent
  return {
    dir: f.dir,
    'max-concurrent-downloads': String(f.maxConcurrentDownloads),
    'max-connection-per-server': String(f.maxConnectionPerServer),
    split: String(f.split),
    'bt-max-peers': String(f.btMaxPeers),
    'max-overall-download-limit': f.maxOverallDownloadLimit,
    'max-overall-upload-limit': f.maxOverallUploadLimit,
    'bt-save-metadata': 'true',
    'bt-load-saved-metadata': 'true',
    'bt-force-encryption': String(!!f.btForceEncryption),
    'seed-ratio': String(f.seedRatio),
    'seed-time': String(f.seedTime),
    'keep-seeding': String(!!f.keepSeeding),
    'follow-torrent': String(autoContent),
    'follow-metalink': String(autoContent),
    'pause-metadata': String(!autoContent),
    continue: String(f.continue !== false),
    'remote-time': String(!!f.remoteTime),
  }
}

/**
 * Transforms the basic form for store persistence.
 * Expands btAutoDownloadContent back into followTorrent/followMetalink/pauseMetadata.
 * Since v2, split and maxConnectionPerServer are persisted independently.
 */
export function transformBasicForStore(f: BasicForm): Partial<AppConfig> {
  const data = { ...f } as Partial<AppConfig> & Record<string, unknown>
  delete data.btAutoDownloadContent
  // split and maxConnectionPerServer are persisted independently (v2 decoupling)
  data.split = f.split
  if (f.btAutoDownloadContent) {
    data.followTorrent = true
    data.followMetalink = true
    data.pauseMetadata = false
  } else {
    data.followTorrent = false
    data.followMetalink = false
    data.pauseMetadata = true
  }
  // Collapse flattened clipboard fields back into nested ClipboardConfig object
  data.clipboard = {
    enable: f.clipboardEnable,
    http: f.clipboardHttp,
    ftp: f.clipboardFtp,
    magnet: f.clipboardMagnet,
    thunder: f.clipboardThunder,
    btHash: f.clipboardBtHash,
  }
  delete data.clipboardEnable
  delete data.clipboardHttp
  delete data.clipboardFtp
  delete data.clipboardMagnet
  delete data.clipboardThunder
  delete data.clipboardBtHash
  // Collapse flattened protocol fields back into nested ProtocolsConfig object
  data.protocols = {
    magnet: f.protocolMagnet,
    thunder: f.protocolThunder,
    motrixnext: f.protocolMotrixnext,
  }
  delete data.protocolMagnet
  delete data.protocolThunder
  delete data.protocolMotrixnext
  return data
}
