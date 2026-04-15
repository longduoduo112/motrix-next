<script setup lang="ts">
/** @fileoverview Basic preference form: theme, locale, download dir, speed limits. */
import { ref, computed, watch, onMounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePreferenceStore } from '@/stores/preference'
import { usePreferenceForm } from '@/composables/usePreferenceForm'
import { useEngineRestart } from '@/composables/useEngineRestart'
import { relaunch } from '@tauri-apps/plugin-process'
import { useIpc } from '@/composables/useIpc'
import { arch as osArch, version as osVersion } from '@tauri-apps/plugin-os'
import { usePlatform } from '@/composables/usePlatform'
import { getVersion as getAppVersion } from '@tauri-apps/api/app'
import { getVersion as getAria2Version } from '@/api/aria2'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { downloadDir } from '@tauri-apps/api/path'
import { extractSpeedUnit } from '@shared/utils'
import { logger } from '@shared/logger'
import { toggleSpeedLimit } from '@/composables/useSpeedLimiter'
import { changeGlobalOption, isEngineReady } from '@/api/aria2'
import {
  ENGINE_RPC_PORT,
  ENGINE_MAX_CONNECTION_PER_SERVER,
  ENGINE_MAX_BT_MAX_PEERS,
  SAFE_LIMIT_SPLIT,
  SAFE_LIMIT_CONNECTION_PER_SERVER,
  SAFE_LIMIT_BT_MAX_PEERS,
  COLOR_SCHEMES,
  SCHEDULE_DAY,
  buildDefaultCategories,
  MAX_FILE_CATEGORIES,
} from '@shared/constants'
import { useAppMessage } from '@/composables/useAppMessage'
import { buildBasicForm, buildBasicSystemConfig, transformBasicForStore } from '@/composables/useBasicPreference'
import type { FileCategory } from '@shared/types'
import { vAutoAnimate } from '@formkit/auto-animate'
import {
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NButton,
  NDivider,
  NInputGroup,
  NText,
  NCollapseTransition,
  NDynamicTags,
  NTag,
  NSpace,
  NRadioGroup,
  NRadioButton,
  useDialog,
} from 'naive-ui'
import PreferenceActionBar from './PreferenceActionBar.vue'
import MTooltip from '@/components/common/MTooltip.vue'
import { FolderOpenOutline, CloudDownloadOutline } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import UpdateDialog from '@/components/preference/UpdateDialog.vue'

const { t, locale } = useI18n()
const preferenceStore = usePreferenceStore()

const dialog = useDialog()
const message = useAppMessage()
const defaultDownloadDir = ref('')
const { isMac, isWindows, isLinux, platformLabel, archLabel: getArchLabel } = usePlatform()

// ─── System info card ────────────────────────────────────────────────
const sysArch = ref('')
const sysOsVersion = ref('')
const sysAppVersion = ref('')
const sysAria2Version = ref('')
const archLabelDisplay = computed(() => getArchLabel(sysArch.value))

async function copyVersionToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t('about.version-copied', { label }))
  } catch {
    /* Clipboard API may fail in some contexts — silently ignore. */
  }
}
const updateDialogRef = ref<InstanceType<typeof UpdateDialog> | null>(null)

const checkIntervalOptions = [
  { label: t('preferences.interval-daily'), value: 24 },
  { label: t('preferences.interval-weekly'), value: 168 },
  { label: t('preferences.interval-monthly'), value: 720 },
  { label: t('preferences.interval-semi-annual'), value: 4320 },
  { label: t('preferences.interval-yearly'), value: 8760 },
]

function buildForm() {
  return buildBasicForm(preferenceStore.config, defaultDownloadDir.value)
}

// ── Safe-limit warning configuration ────────────────────────────────
// Declarative config: fields that exceed their safe threshold are collected
// and presented in a single merged warning dialog before save.
const safeLimits = [
  {
    field: 'split' as const,
    safe: SAFE_LIMIT_SPLIT,
    labelKey: 'preferences.split-count',
    reasonKey: 'preferences.high-split-reason',
  },
  {
    field: 'maxConnectionPerServer' as const,
    safe: SAFE_LIMIT_CONNECTION_PER_SERVER,
    labelKey: 'preferences.max-connection-per-server',
    reasonKey: 'preferences.high-connection-reason',
  },
  {
    field: 'btMaxPeers' as const,
    safe: SAFE_LIMIT_BT_MAX_PEERS,
    labelKey: 'preferences.bt-max-peers',
    reasonKey: 'preferences.high-bt-peers-reason',
  },
]

/**
 * Builds a merged warning VNode listing all exceeded fields,
 * each with its current value, recommended limit, and risk reason.
 * Uses Vue h() because Naive UI dialog.content renders strings as plain text
 * without line break support.
 */
function buildSafeLimitContent(f: Record<string, unknown>, exceeded: typeof safeLimits) {
  return h(
    'div',
    { style: 'display: flex; flex-direction: column; gap: 12px' },
    exceeded.map((e) => {
      const current = f[e.field] as number
      return h('div', [
        h(
          'div',
          { style: 'font-weight: 500' },
          `• ${t(e.labelKey)}: ${current} (${t('preferences.recommended-limit', { value: e.safe })})`,
        ),
        h('div', { style: 'padding-left: 14px; opacity: 0.75' }, t(e.reasonKey)),
      ])
    }),
  )
}

/**
 * Shows a single merged warning dialog for all exceeded fields.
 * On cancel, all exceeded fields revert to their safe values atomically.
 */
function confirmSafeLimits(f: Record<string, unknown>, exceeded: typeof safeLimits): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const revert = () => {
      for (const e of exceeded) f[e.field] = e.safe
      resolve(false)
    }
    dialog.warning({
      title: t('preferences.safe-limit-warning-title'),
      content: () => buildSafeLimitContent(f, exceeded),
      positiveText: t('preferences.high-connection-continue'),
      negativeText: t('app.cancel'),
      onPositiveClick: () => resolve(true),
      onNegativeClick: revert,
      onClose: revert,
    })
  })
}

/**
 * Builds dynamic VNode content for the protocol-disable confirmation dialog.
 *
 * Layout adapts to the combination of disabled protocols:
 * - Single category → plain sentence (no bullet list)
 * - Both categories → intro line + bullet list
 */
function buildProtocolDisableContent(disabledLinks: string[], disabledExt: boolean) {
  const totalItems = disabledLinks.length + (disabledExt ? 1 : 0)
  const useBullets = totalItems > 1

  const items: ReturnType<typeof h>[] = []
  for (const p of disabledLinks) {
    const text = t('preferences.protocol-disable-link-warning', { protocols: `${p}://` })
    items.push(h('div', useBullets ? `• ${text}` : text))
  }
  if (disabledExt) {
    const text = t('preferences.protocol-disable-ext-warning')
    items.push(h('div', useBullets ? `• ${text}` : text))
  }

  if (useBullets) {
    return h('div', { style: 'display: flex; flex-direction: column; gap: 8px' }, [
      h('div', t('preferences.protocol-disable-intro')),
      ...items,
    ])
  }
  return h('div', items)
}

/**
 * Single merged confirmation dialog when one or more protocol toggles
 * are being disabled. Returns false to abort the save.
 */
function confirmProtocolDisable(disabledLinks: string[], disabledExt: boolean): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    dialog.warning({
      title: t('preferences.protocol-disable-title'),
      content: () => buildProtocolDisableContent(disabledLinks, disabledExt),
      positiveText: t('preferences.protocol-disable-confirm'),
      negativeText: t('app.cancel'),
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
    })
  })
}

const { form, isDirty, handleSave, handleReset, resetSnapshot, patchSnapshot } = usePreferenceForm({
  buildForm,
  buildSystemConfig: buildBasicSystemConfig,
  transformForStore: transformBasicForStore,
  beforeSave: async (f) => {
    // Collect all fields exceeding their safe threshold, show one merged dialog
    const exceeded = safeLimits.filter((e) => {
      const v = f[e.field as string]
      return typeof v === 'number' && v > e.safe
    })
    if (exceeded.length > 0) {
      const ok = await confirmSafeLimits(f, exceeded)
      if (!ok) return false
    }

    // Protocol disable confirmation — single merged dialog.
    // Separates link protocols (magnet/thunder) from extension protocol (motrixnext)
    // to give the user distinct, understandable warnings.
    const prev = preferenceStore.config.protocols
    const disabledLinks: string[] = []
    if (prev.magnet && !f.protocolMagnet) disabledLinks.push('magnet')
    if (prev.thunder && !f.protocolThunder) disabledLinks.push('thunder')
    const disabledExt = prev.motrixnext && !f.protocolMotrixnext

    if (disabledLinks.length > 0 || disabledExt) {
      const ok = await confirmProtocolDisable(disabledLinks, disabledExt)
      if (!ok) return false
    }

    return true
  },
  afterSave: async (f, prevConfig) => {
    // Locale change → restart prompt
    const prevLocale = prevConfig.locale || 'en-US'
    if (f.locale !== prevLocale) {
      const targetLocale = f.locale
      const isEn = targetLocale === 'en-US'
      const tt = (key: string) => t(key, {}, { locale: targetLocale })
      dialog.info({
        style: 'min-width: 520px',
        title: isEn
          ? tt('preferences.language-changed-title')
          : () =>
              h('div', { style: 'padding-left: 12px' }, [
                h('div', tt('preferences.language-changed-title')),
                h('div', 'Language Changed'),
              ]),
        content: isEn
          ? tt('preferences.language-changed-content')
          : () =>
              h('div', { style: 'padding: 10px 0' }, [
                h('p', { style: 'margin: 0' }, tt('preferences.language-changed-content')),
                h('p', { style: 'margin: 0' }, 'Please restart the application to apply the new language.'),
              ]),
        positiveText: isEn
          ? tt('preferences.language-changed-restart')
          : `${tt('preferences.language-changed-restart')} · Restart Now`,
        negativeText: isEn
          ? tt('preferences.language-changed-later')
          : `${tt('preferences.language-changed-later')} · Later`,
        onPositiveClick: async () => {
          const { stopEngine } = useIpc()
          await stopEngine()
          relaunch()
        },
      })
    }

    // Sync autostart state immediately on save
    if (f.openAtLogin !== !!prevConfig.openAtLogin) {
      try {
        const { isEnabled, enable, disable } = await import('@tauri-apps/plugin-autostart')
        const currentlyEnabled = await isEnabled()
        if (f.openAtLogin && !currentlyEnabled) await enable()
        else if (!f.openAtLogin && currentlyEnabled) await disable()
      } catch (e) {
        logger.error('Preference.autostart', e)
      }
    }

    // Sync protocol handler registration on save (reconcile-based).
    //
    // For ENABLED protocols: always query OS actual state and register if
    // not already the default handler.  This fixes the bug where config.json
    // already says "enabled" (true) but macOS/Windows lost the association
    // (reinstall, another app taking over).  The old diff-based approach
    // compared form values against prevConfig and saw true===true → skipped
    // registration silently.
    //
    // For DISABLED protocols: use prevConfig diff (only unregister when the
    // user explicitly toggles ON→OFF, not on every save).
    //
    // This matches the autostart reconcile pattern in the same afterSave
    // callback (L277-L286) which queries isEnabled() from the OS.
    {
      const { invoke } = await import('@tauri-apps/api/core')
      const prevProtocols = prevConfig.protocols ?? { magnet: false, thunder: false, motrixnext: true }
      for (const [protocol, formKey, prev] of [
        ['magnet', 'protocolMagnet', prevProtocols.magnet],
        ['thunder', 'protocolThunder', prevProtocols.thunder],
        ['motrixnext', 'protocolMotrixnext', prevProtocols.motrixnext],
      ] as const) {
        const enabled = f[formKey] as boolean
        try {
          if (enabled) {
            // Reconcile: query OS actual state, register only if needed.
            const isDefault = await invoke<boolean>('is_default_protocol_client', { protocol })
            if (!isDefault) {
              await invoke('set_default_protocol_client', { protocol })
              message.success(t('preferences.protocol-registered', { protocol }))
            }
          } else if (prev) {
            // Explicit OFF: user toggled ON→OFF — unregister.
            if (isMac.value) {
              message.info(t('preferences.protocol-macos-unregister-hint', { protocol }))
            } else {
              await invoke('remove_as_default_protocol_client', { protocol })
              message.success(t('preferences.protocol-unregistered', { protocol }))
            }
          }
        } catch (e) {
          // Tauri IPC errors arrive as serialized AppError objects
          // (e.g. { Protocol: "message" }), not Error instances.
          // String() on a plain object produces "[object Object]".
          const reason =
            e instanceof Error
              ? e.message
              : typeof e === 'object' && e !== null
                ? Object.values(e as Record<string, unknown>).join(': ')
                : String(e)
          logger.warn('Basic.protocol', `Failed to ${enabled ? 'register' : 'unregister'} ${protocol}: ${reason}`)
          message.error(t('preferences.protocol-failed', { protocol, reason }))

          // Roll back the toggle to its pre-save state and persist the
          // reverted value so the switch doesn't stay in an inconsistent
          // state after a failed OS registration attempt.
          ;(f as Record<string, unknown>)[formKey] = prev
          patchSnapshot({ [formKey]: prev } as Partial<typeof form.value>)
          const revertedProtocols = { ...preferenceStore.config.protocols, [protocol]: prev }
          preferenceStore.updateAndSave({ protocols: revertedProtocols })
        }
      }
    }
  },
})

// One-shot sync: if async OS locale detection completes after mount, patch the form.
// On first launch (no config.json), buildForm() snapshots locale as 'en-US' (fallback)
// because main.ts hasn't finished getLocale() yet. When detection completes and
// updateAndSave() writes the real locale, this watcher patches the dropdown once.
const stopLocaleSync = watch(
  () => preferenceStore.config.locale,
  (detected) => {
    if (detected && form.value.locale === 'en-US' && detected !== 'en-US') {
      form.value.locale = detected
      patchSnapshot({ locale: detected } as Partial<typeof form.value>)
      stopLocaleSync()
    }
  },
)

// ── Instant color‑scheme application ─────────────────────────────────
// Color scheme is a purely visual preference that benefits from instant
// feedback. Persist directly to the store on click — no Save & Apply needed.
// The snapshot is also patched so isDirty stays false for this field.
watch(
  () => form.value.colorScheme,
  (newId, oldId) => {
    if (!newId || newId === oldId) return
    preferenceStore.updateAndSave({ colorScheme: newId })
    patchSnapshot({ colorScheme: newId } as Partial<typeof form.value>)
    const scheme = COLOR_SCHEMES.find((s) => s.id === newId)
    if (scheme) {
      message.success(t('preferences.color-scheme-switched', { name: t(scheme.labelKey) }))
    }
  },
)

// ── Instant theme (appearance) application ───────────────────────────
// Theme is also a purely visual preference — apply immediately.
watch(
  () => form.value.theme,
  (newTheme, oldTheme) => {
    if (!newTheme || newTheme === oldTheme) return
    preferenceStore.updateAndSave({ theme: newTheme as 'auto' | 'light' | 'dark' })
    patchSnapshot({ theme: newTheme } as Partial<typeof form.value>)
  },
)

const uploadSpeedValue = ref(0)
const uploadUnit = ref('K')
const downloadSpeedValue = ref(0)
const downloadUnit = ref('K')

const speedUnitOptions = [
  { label: 'KB/s', value: 'K' },
  { label: 'MB/s', value: 'M' },
]

// ── Schedule time options (HH:mm in 30-min steps) ───────────────────
const timeOptions = (() => {
  const opts: Array<{ label: string; value: string }> = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      opts.push({ label: `${hh}:${mm}`, value: `${hh}:${mm}` })
    }
  }
  return opts
})()

const scheduleDayOptions = computed(() => [
  { label: t('preferences.schedule-days-everyday'), value: SCHEDULE_DAY.EVERY_DAY },
  { label: t('preferences.schedule-days-weekdays'), value: SCHEDULE_DAY.WEEKDAYS },
  { label: t('preferences.schedule-days-weekends'), value: SCHEDULE_DAY.WEEKENDS },
])

const localeOptions = [
  { label: 'English', value: 'en-US' },
  { label: '简体中文 · Chinese Simplified', value: 'zh-CN' },
  { label: '繁體中文 · Chinese Traditional', value: 'zh-TW' },
  { label: '日本語 · Japanese', value: 'ja' },
  { label: '한국어 · Korean', value: 'ko' },
  { label: 'Français · French', value: 'fr' },
  { label: 'Deutsch · German', value: 'de' },
  { label: 'Español · Spanish', value: 'es' },
  { label: 'Português · Portuguese (Brazil)', value: 'pt-BR' },
  { label: 'Русский · Russian', value: 'ru' },
  { label: 'Türkçe · Turkish', value: 'tr' },
  { label: 'العربية · Arabic', value: 'ar' },
  { label: 'Български · Bulgarian', value: 'bg' },
  { label: 'Català · Catalan', value: 'ca' },
  { label: 'Ελληνικά · Greek', value: 'el' },
  { label: 'فارسی · Persian', value: 'fa' },
  { label: 'Magyar · Hungarian', value: 'hu' },
  { label: 'Bahasa Indonesia · Indonesian', value: 'id' },
  { label: 'Italiano · Italian', value: 'it' },
  { label: 'Norsk Bokmål · Norwegian', value: 'nb' },
  { label: 'Nederlands · Dutch', value: 'nl' },
  { label: 'Polski · Polish', value: 'pl' },
  { label: 'Română · Romanian', value: 'ro' },
  { label: 'ไทย · Thai', value: 'th' },
  { label: 'Українська · Ukrainian', value: 'uk' },
  { label: 'Tiếng Việt · Vietnamese', value: 'vi' },
]

const themeOptions = computed(() => [
  { label: t('preferences.theme-auto'), value: 'auto' },
  { label: t('preferences.theme-light'), value: 'light' },
  { label: t('preferences.theme-dark'), value: 'dark' },
])

function parseSpeedLimit(value: unknown) {
  const str = String(value || '0')
  const num = parseInt(str, 10) || 0
  const unit = extractSpeedUnit(str) || 'K'
  return { num, unit }
}

function buildSpeedLimit(value: number, unit: string): string {
  return value > 0 ? `${value}${unit}` : '0'
}

function handleUploadUnitChange(val: string) {
  uploadUnit.value = val
  form.value.maxOverallUploadLimit = buildSpeedLimit(uploadSpeedValue.value, val)
}

function handleDownloadUnitChange(val: string) {
  downloadUnit.value = val
  form.value.maxOverallDownloadLimit = buildSpeedLimit(downloadSpeedValue.value, val)
}

function handleUploadValueChange(val: number | null) {
  const v = val || 0
  uploadSpeedValue.value = v
  form.value.maxOverallUploadLimit = buildSpeedLimit(v, uploadUnit.value)
}

function handleDownloadValueChange(val: number | null) {
  const v = val || 0
  downloadSpeedValue.value = v
  form.value.maxOverallDownloadLimit = buildSpeedLimit(v, downloadUnit.value)
}

function onKeepSeedingChange(enable: boolean) {
  if (enable) {
    form.value.seedRatio = 0
    form.value.seedTime = 525600
  } else {
    form.value.seedRatio = 1
    form.value.seedTime = 60
  }
}

async function handleSelectDir() {
  const selected = await openDialog({ directory: true, multiple: false })
  if (typeof selected === 'string') form.value.dir = selected
}

async function handleSelectCategoryDir(index: number) {
  const selected = await openDialog({ directory: true, multiple: false })
  if (typeof selected === 'string') {
    form.value.fileCategories[index].directory = selected
  }
}

function handleCategoryExtChange(index: number, extensions: string[]) {
  form.value.fileCategories[index].extensions = extensions.map((e) => e.toLowerCase().replace(/^\./, ''))
}

function handleDeleteCategory(index: number) {
  form.value.fileCategories.splice(index, 1)
}

function handleAddCategory() {
  if (form.value.fileCategories.length >= MAX_FILE_CATEGORIES) return
  const baseDir = form.value.dir || defaultDownloadDir.value
  form.value.fileCategories.push({
    label: '',
    extensions: [],
    directory: baseDir,
    builtIn: false,
  })
}

function handleResetCategories() {
  const baseDir = form.value.dir || defaultDownloadDir.value
  form.value.fileCategories = buildDefaultCategories(baseDir)
}

// ── Category card stable key ────────────────────────────────────────
// Uses non-enumerable _uid to avoid polluting serialization / dirty state.

let categoryUid = 0

function ensureCategoryUid(cat: FileCategory): string {
  const record = cat as unknown as Record<string, unknown>
  if (!record._uid) {
    Object.defineProperty(cat, '_uid', { value: `cat-${++categoryUid}`, enumerable: false })
  }
  return record._uid as string
}

function handleCategoryLabelChange(index: number, label: string) {
  form.value.fileCategories[index].label = label
}

function handleCategoryDirInput(index: number, value: string) {
  form.value.fileCategories[index].directory = value
}

function loadForm() {
  Object.assign(form.value, buildForm())

  const ul = parseSpeedLimit(form.value.maxOverallUploadLimit)
  uploadSpeedValue.value = ul.num
  uploadUnit.value = ul.unit

  const dl = parseSpeedLimit(form.value.maxOverallDownloadLimit)
  downloadSpeedValue.value = dl.num
  downloadUnit.value = dl.unit
}

function handleCheckUpdate() {
  updateDialogRef.value?.open()
}

const { restartEngine } = useEngineRestart()

function handleManualRestart() {
  const port = (preferenceStore.config.rpcListenPort as number) || ENGINE_RPC_PORT
  const secret = (preferenceStore.config.rpcSecret as string) || ''
  const d = dialog.warning({
    title: t('preferences.engine-restart-title'),
    content: t('preferences.engine-restart-manual-confirm'),
    positiveText: t('preferences.engine-restart-now'),
    negativeText: t('preferences.engine-restart-later'),
    maskClosable: false,
    onPositiveClick: async () => {
      d.loading = true
      d.negativeText = ''
      d.closable = false
      message.info(t('preferences.engine-restarting'))
      await new Promise((r) => requestAnimationFrame(r))
      await restartEngine({ port, secret })
    },
  })
}

async function handleSpeedLimitToggle() {
  if (!isEngineReady()) return
  try {
    const result = await toggleSpeedLimit(preferenceStore.config, {
      changeGlobalOption,
      updateAndSave: (partial) => preferenceStore.updateAndSave(partial),
    })
    if (result === 'enabled') {
      message.success(t('app.speedometer-limit-applied'))
    } else if (result === 'disabled') {
      message.success(t('app.speedometer-limit-removed'))
    } else {
      message.info(t('app.speedometer-needs-config-settings'))
    }
  } catch (e) {
    logger.error('Basic.speedLimitToggle', e)
  }
}

async function handleScheduleToggle(enabled: boolean) {
  try {
    await preferenceStore.updateAndSave({ speedScheduleEnabled: enabled })
    message.success(t(enabled ? 'app.schedule-enabled' : 'app.schedule-disabled'))
  } catch (e) {
    logger.error('Basic.scheduleToggle', e)
  }
}

onMounted(async () => {
  try {
    defaultDownloadDir.value = await downloadDir()
  } catch (e) {
    logger.debug('Basic.downloadDir', e)
  }
  // Platform is initialised by usePlatform() singleton — no per-component call needed.
  try {
    sysArch.value = osArch()
  } catch (e) {
    logger.debug('Basic.arch', e)
  }
  try {
    sysOsVersion.value = osVersion()
  } catch (e) {
    logger.debug('Basic.osVersion', e)
  }
  try {
    sysAppVersion.value = await getAppVersion()
  } catch (e) {
    logger.debug('Basic.appVersion', e)
  }
  try {
    const info = await getAria2Version()
    sysAria2Version.value = info.version
  } catch (e) {
    logger.debug('Basic.aria2Version', e)
  }
  loadForm()
  resetSnapshot()

  // Read actual OS registration state for protocol toggles (all platforms).
  // Uses custom Rust commands that support macOS NSWorkspace + Windows/Linux deep-link.
  // This ensures the switches reflect reality even if another app has taken
  // over the protocol association since Motrix last ran.
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    form.value.protocolMagnet = await invoke<boolean>('is_default_protocol_client', { protocol: 'magnet' })
    form.value.protocolThunder = await invoke<boolean>('is_default_protocol_client', { protocol: 'thunder' })
    form.value.protocolMotrixnext = await invoke<boolean>('is_default_protocol_client', { protocol: 'motrixnext' })
    // Patch snapshot so OS-queried values don't falsely trigger dirty state.
    patchSnapshot({
      protocolMagnet: form.value.protocolMagnet,
      protocolThunder: form.value.protocolThunder,
      protocolMotrixnext: form.value.protocolMotrixnext,
    } as Partial<typeof form.value>)
  } catch (e) {
    logger.debug('Basic.protocolCheck', e)
  }
})
</script>

<template>
  <div class="preference-form-wrapper">
    <NForm label-placement="left" label-align="left" label-width="260px" size="small" class="form-preference">
      <!-- System info — About-panel badge style -->
      <NDivider title-placement="left">{{ t('preferences.system-info') }}</NDivider>
      <NFormItem :label="t('preferences.detected-platform')">
        <NSpace :size="8">
          <NTag type="info" round size="medium">{{ platformLabel }}</NTag>
          <NTag type="success" round size="medium">{{ archLabelDisplay }}</NTag>
        </NSpace>
      </NFormItem>
      <NFormItem :label="t('about.app-version')">
        <MTooltip>
          <template #trigger>
            <button
              class="sysinfo-ver-badge"
              @click="copyVersionToClipboard(`Motrix Next v${sysAppVersion}`, 'Motrix Next')"
            >
              <span class="sysinfo-ver-value">v{{ sysAppVersion || '\u2014' }}</span>
              <svg class="sysinfo-ver-copy" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2" />
              </svg>
            </button>
          </template>
          {{ t('about.click-to-copy') }}
        </MTooltip>
      </NFormItem>
      <NFormItem :label="t('about.aria2-version')">
        <MTooltip v-if="sysAria2Version">
          <template #trigger>
            <button class="sysinfo-ver-badge" @click="copyVersionToClipboard(`aria2 v${sysAria2Version}`, 'aria2')">
              <span class="sysinfo-ver-value">v{{ sysAria2Version }}</span>
              <svg class="sysinfo-ver-copy" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2" />
              </svg>
            </button>
          </template>
          {{ t('about.click-to-copy') }}
        </MTooltip>
        <div v-else class="sysinfo-ver-badge sysinfo-ver-badge--muted">
          <span class="sysinfo-ver-muted">{{ t('about.unavailable') }}</span>
        </div>
      </NFormItem>
      <NDivider title-placement="left">
        {{ locale === 'en-US' ? t('preferences.language') : `${t('preferences.language')} · Language` }}
      </NDivider>
      <NFormItem
        :label="
          locale === 'en-US'
            ? t('preferences.select-language')
            : `${t('preferences.select-language')} · Select Language`
        "
      >
        <NSelect v-model:value="form.locale" :options="localeOptions" style="width: 280px" />
      </NFormItem>

      <NDivider title-placement="left">{{ t('preferences.auto-update') }}</NDivider>
      <NFormItem :label="t('preferences.auto-check-update')">
        <NSwitch v-model:value="form.autoCheckUpdate" />
      </NFormItem>
      <NCollapseTransition :show="form.autoCheckUpdate" class="collapse-indent">
        <NFormItem :label="t('preferences.check-frequency')">
          <NSelect v-model:value="form.autoCheckUpdateInterval" :options="checkIntervalOptions" style="width: 180px" />
        </NFormItem>
      </NCollapseTransition>
      <NFormItem :label="t('preferences.update-channel')">
        <NRadioGroup
          v-model:value="form.updateChannel"
          size="small"
          @update:value="
            async (v: string) => {
              const ok = await preferenceStore.updateAndSave({ updateChannel: v as 'stable' | 'beta' })
              if (ok) {
                // Only sync updateChannel in the snapshot — preserve dirty state
                // for other unsaved fields (download dir, speed limits, etc.).
                patchSnapshot({ updateChannel: v } as Partial<typeof form.value>)
              }
            }
          "
        >
          <NRadioButton value="stable">{{ t('preferences.update-channel-stable') }}</NRadioButton>
          <NRadioButton value="beta">{{ t('preferences.update-channel-beta') }}</NRadioButton>
        </NRadioGroup>
      </NFormItem>
      <NFormItem :label="t('preferences.last-check-update-time')">
        <div style="display: flex; align-items: center; gap: 16px">
          <NButton size="small" @click="handleCheckUpdate">
            <template #icon>
              <NIcon :size="14"><CloudDownloadOutline /></NIcon>
            </template>
            {{ t('app.check-updates-now') }}
          </NButton>
          <NText v-if="preferenceStore.config.lastCheckUpdateTime" depth="3" style="font-size: 13px">
            {{ new Date(preferenceStore.config.lastCheckUpdateTime).toLocaleString() }}
          </NText>
          <NText v-else depth="3" style="font-size: 13px">—</NText>
        </div>
      </NFormItem>
      <UpdateDialog ref="updateDialogRef" />

      <NDivider title-placement="left">{{ t('preferences.appearance-section') }}</NDivider>
      <NFormItem :label="t('preferences.appearance')">
        <NSelect v-model:value="form.theme" :options="themeOptions" style="width: 200px" />
      </NFormItem>

      <!-- ── Color Scheme Picker ────────────────────────────────── -->
      <NFormItem :label="t('preferences.color-scheme')">
        <div class="color-scheme-picker">
          <MTooltip v-for="scheme in COLOR_SCHEMES" :key="scheme.id">
            <template #trigger>
              <button
                class="color-swatch"
                :class="{ active: form.colorScheme === scheme.id }"
                :style="{ '--swatch-color': scheme.seed }"
                @click="form.colorScheme = scheme.id"
              >
                <svg v-if="form.colorScheme === scheme.id" class="swatch-check" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 8.5L6.5 11L12 5"
                    stroke="white"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </template>
            {{ t(scheme.labelKey) }}
          </MTooltip>
        </div>
      </NFormItem>
      <NFormItem v-if="isMac || isWindows" :label="t('preferences.show-progress-bar')">
        <NSwitch v-model:value="form.showProgressBar" />
      </NFormItem>

      <NFormItem v-if="isMac" :label="t('preferences.dock-badge-speed')">
        <NSwitch v-model:value="form.dockBadgeSpeed" />
      </NFormItem>

      <NDivider title-placement="left">{{ t('preferences.window-and-tray') }}</NDivider>
      <NFormItem :label="t('preferences.minimize-to-tray-on-close')">
        <NSwitch v-model:value="form.minimizeToTrayOnClose" />
      </NFormItem>
      <NFormItem v-if="isMac" :label="t('preferences.hide-dock-on-minimize')">
        <NSwitch v-model:value="form.hideDockOnMinimize" />
      </NFormItem>
      <NFormItem v-if="isMac || isLinux" :label="t('preferences.tray-speedometer')">
        <NSwitch v-model:value="form.traySpeedometer" />
      </NFormItem>
      <NFormItem :label="t('preferences.lightweight-mode')">
        <NSwitch v-model:value="form.lightweightMode" :disabled="!form.minimizeToTrayOnClose" />
      </NFormItem>
      <NText
        v-if="form.minimizeToTrayOnClose"
        depth="3"
        style="font-size: 12px; display: block; margin-top: -8px; margin-bottom: 8px; padding-left: 50px"
      >
        {{ t('preferences.lightweight-mode-hint') }}
      </NText>

      <NDivider title-placement="left">{{ t('preferences.startup') }}</NDivider>
      <NFormItem :label="t('preferences.open-at-login')">
        <NSwitch v-model:value="form.openAtLogin" />
      </NFormItem>
      <NCollapseTransition :show="form.openAtLogin" class="collapse-indent">
        <NFormItem :label="t('preferences.auto-hide-window')">
          <NSwitch v-model:value="form.autoHideWindow" />
        </NFormItem>
      </NCollapseTransition>
      <NFormItem :label="t('preferences.keep-window-state')">
        <NSwitch v-model:value="form.keepWindowState" />
      </NFormItem>
      <NFormItem :label="t('preferences.auto-resume-all')">
        <NSwitch v-model:value="form.resumeAllWhenAppLaunched" />
      </NFormItem>

      <NDivider title-placement="left">{{ t('preferences.download-path') }}</NDivider>
      <NFormItem :label="t('preferences.default-path')">
        <NInputGroup>
          <NInput v-model:value="form.dir" style="flex: 1" />
          <NButton style="padding: 0 12px" @click="handleSelectDir">
            <template #icon>
              <NIcon :size="16"><FolderOpenOutline /></NIcon>
            </template>
          </NButton>
        </NInputGroup>
      </NFormItem>
      <NFormItem :label="t('preferences.file-category-save')">
        <NSwitch v-model:value="form.fileCategoryEnabled" />
      </NFormItem>
      <NCollapseTransition :show="form.fileCategoryEnabled">
        <NFormItem :show-label="false">
          <div class="file-category-list">
            <div v-auto-animate="{ duration: 250, easing: 'ease-out' }" class="file-category-cards">
              <div v-for="(cat, idx) in form.fileCategories" :key="ensureCategoryUid(cat)" class="file-category-card">
                <div class="file-category-header">
                  <span v-if="cat.builtIn" class="file-category-label">{{ t(`preferences.${cat.label}`) }}</span>
                  <NInput
                    v-else
                    :value="cat.label"
                    size="small"
                    :placeholder="t('preferences.file-category-custom-label')"
                    style="width: 120px"
                    @update:value="(v: string) => handleCategoryLabelChange(idx, v)"
                  />
                  <NButton
                    class="ghost-btn--danger"
                    size="tiny"
                    ghost
                    style="margin-left: auto"
                    @click="handleDeleteCategory(idx)"
                  >
                    {{ t('edit.delete') }}
                  </NButton>
                </div>
                <NDynamicTags
                  :value="cat.extensions.map((e: string) => `.${e}`)"
                  size="small"
                  @update:value="(tags: string[]) => handleCategoryExtChange(idx, tags)"
                />
                <NInputGroup>
                  <NInput
                    :value="cat.directory"
                    size="small"
                    style="flex: 1"
                    @update:value="(v: string) => handleCategoryDirInput(idx, v)"
                  />
                  <NButton size="small" style="padding: 0 8px" @click="handleSelectCategoryDir(idx)">
                    <template #icon>
                      <NIcon :size="14"><FolderOpenOutline /></NIcon>
                    </template>
                  </NButton>
                </NInputGroup>
              </div>
            </div>
            <div class="file-category-actions">
              <NButton size="small" dashed @click="handleAddCategory">
                {{ t('preferences.file-category-add') }}
              </NButton>
              <NButton size="small" quaternary @click="handleResetCategories">
                ↺ {{ t('preferences.file-category-reset') }}
              </NButton>
            </div>
            <NText depth="3" style="font-size: 12px; display: block; margin-top: 4px">
              ⓘ {{ t('preferences.file-category-auto-archive-hint') }}
            </NText>
          </div>
        </NFormItem>
      </NCollapseTransition>

      <NDivider title-placement="left">{{ t('preferences.speed-limit') }}</NDivider>
      <NFormItem :label="t('app.speedometer-enable-limit')">
        <NSwitch :value="preferenceStore.config.speedLimitEnabled" @update:value="handleSpeedLimitToggle" />
      </NFormItem>

      <NFormItem :label="t('preferences.speed-schedule-enabled')">
        <NSwitch :value="preferenceStore.config.speedScheduleEnabled" @update:value="handleScheduleToggle" />
      </NFormItem>
      <NCollapseTransition :show="preferenceStore.config.speedScheduleEnabled" class="collapse-indent">
        <Transition name="schedule-warn">
          <NFormItem v-if="!preferenceStore.config.speedLimitEnabled" :show-label="false">
            <NText depth="3" type="warning" style="font-size: 12px">
              {{ t('preferences.schedule-needs-limit') }}
            </NText>
          </NFormItem>
        </Transition>
        <NFormItem :label="t('preferences.schedule-from')">
          <NSelect v-model:value="form.speedScheduleFrom" :options="timeOptions" style="width: 120px" />
        </NFormItem>
        <NFormItem :label="t('preferences.schedule-to')">
          <NSelect v-model:value="form.speedScheduleTo" :options="timeOptions" style="width: 120px" />
        </NFormItem>
        <NFormItem :label="t('preferences.schedule-days')">
          <NSelect v-model:value="form.speedScheduleDays" :options="scheduleDayOptions" style="width: 160px" />
        </NFormItem>
        <NText depth="3" style="font-size: 12px; display: block; margin-top: -8px; margin-bottom: 8px">
          {{ t('preferences.schedule-hint') }}
        </NText>
      </NCollapseTransition>

      <div>
        <NFormItem :label="t('preferences.transfer-speed-upload')">
          <NInputGroup>
            <NInputNumber
              :value="uploadSpeedValue"
              :min="0"
              :max="65535"
              :step="1"
              style="width: 140px"
              @update:value="handleUploadValueChange"
            />
            <NSelect
              :value="uploadUnit"
              :options="speedUnitOptions"
              style="width: 100px"
              @update:value="handleUploadUnitChange"
            />
          </NInputGroup>
        </NFormItem>
        <NFormItem :label="t('preferences.transfer-speed-download')">
          <NInputGroup>
            <NInputNumber
              :value="downloadSpeedValue"
              :min="0"
              :max="65535"
              :step="1"
              style="width: 140px"
              @update:value="handleDownloadValueChange"
            />
            <NSelect
              :value="downloadUnit"
              :options="speedUnitOptions"
              style="width: 100px"
              @update:value="handleDownloadUnitChange"
            />
          </NInputGroup>
        </NFormItem>
      </div>

      <NDivider title-placement="left">{{ t('preferences.bt-settings') }}</NDivider>
      <NFormItem :label="t('preferences.bt-auto-download-content')">
        <NSwitch v-model:value="form.btAutoDownloadContent" />
      </NFormItem>
      <NFormItem :label="t('preferences.bt-force-encryption')">
        <NSwitch v-model:value="form.btForceEncryption" />
      </NFormItem>
      <NFormItem :label="t('preferences.keep-seeding')">
        <NSwitch v-model:value="form.keepSeeding" @update:value="onKeepSeedingChange" />
      </NFormItem>

      <NCollapseTransition :show="!form.keepSeeding" class="collapse-indent">
        <NFormItem :label="t('preferences.seed-ratio')">
          <NInputNumber v-model:value="form.seedRatio" :min="1" :max="100" :step="0.1" style="width: 120px" />
        </NFormItem>
        <NFormItem :label="t('preferences.seed-time') + ' (' + t('preferences.seed-time-unit') + ')'">
          <NInputNumber v-model:value="form.seedTime" :min="60" :max="525600" style="width: 120px" />
        </NFormItem>
      </NCollapseTransition>

      <NDivider title-placement="left">{{ t('preferences.task-manage') }}</NDivider>
      <NFormItem :label="t('preferences.max-concurrent-downloads')">
        <NInputNumber v-model:value="form.maxConcurrentDownloads" :min="1" :max="10" style="width: 120px" />
      </NFormItem>
      <NFormItem :label="t('preferences.split-count')">
        <NInputNumber
          v-model:value="form.split"
          :min="1"
          :max="ENGINE_MAX_CONNECTION_PER_SERVER"
          style="width: 120px"
        />
      </NFormItem>
      <NFormItem :label="t('preferences.max-connection-per-server')">
        <NInputNumber
          v-model:value="form.maxConnectionPerServer"
          :min="1"
          :max="ENGINE_MAX_CONNECTION_PER_SERVER"
          style="width: 120px"
        />
      </NFormItem>
      <NFormItem :label="t('preferences.bt-max-peers')">
        <NInputNumber v-model:value="form.btMaxPeers" :min="1" :max="ENGINE_MAX_BT_MAX_PEERS" style="width: 120px" />
      </NFormItem>
      <NFormItem :label="t('preferences.continue')">
        <NSwitch v-model:value="form.continue" />
      </NFormItem>
      <NFormItem :label="t('preferences.remote-time')">
        <NSwitch v-model:value="form.remoteTime" />
      </NFormItem>

      <NDivider title-placement="left">{{ t('preferences.notification-and-confirm') }}</NDivider>
      <NFormItem :label="t('preferences.new-task-show-downloading')">
        <NSwitch v-model:value="form.newTaskShowDownloading" />
      </NFormItem>
      <NFormItem :label="t('preferences.task-completed-notify')">
        <NSwitch v-model:value="form.taskNotification" />
      </NFormItem>
      <NFormItem :label="t('preferences.no-confirm-before-delete-task')">
        <NSwitch v-model:value="form.noConfirmBeforeDeleteTask" />
      </NFormItem>
      <NCollapseTransition :show="form.noConfirmBeforeDeleteTask" class="collapse-indent">
        <NFormItem :label="t('preferences.delete-files-when-skip-confirm')">
          <NSwitch v-model:value="form.deleteFilesWhenSkipConfirm" />
        </NFormItem>
      </NCollapseTransition>

      <NDivider title-placement="left">{{ t('preferences.auto-cleanup') }}</NDivider>
      <NFormItem :label="t('preferences.delete-torrent-after-complete')">
        <NSwitch v-model:value="form.deleteTorrentAfterComplete" />
      </NFormItem>
      <NFormItem :label="t('preferences.auto-delete-stale-records')">
        <NSwitch v-model:value="form.autoDeleteStaleRecords" />
      </NFormItem>
      <NFormItem :label="t('preferences.clear-completed-on-exit')">
        <NSwitch v-model:value="form.clearCompletedOnExit" />
      </NFormItem>

      <NDivider title-placement="left">{{ t('preferences.clipboard-detection') }}</NDivider>
      <NFormItem :label="t('preferences.clipboard-auto-detect')">
        <NSwitch v-model:value="form.clipboardEnable" />
      </NFormItem>
      <NCollapseTransition :show="form.clipboardEnable" class="collapse-indent">
        <NFormItem :label="t('preferences.clipboard-http')">
          <NSwitch v-model:value="form.clipboardHttp" />
        </NFormItem>
        <NFormItem :label="t('preferences.clipboard-ftp')">
          <NSwitch v-model:value="form.clipboardFtp" />
        </NFormItem>
        <NFormItem :label="t('preferences.clipboard-magnet')">
          <NSwitch v-model:value="form.clipboardMagnet" />
        </NFormItem>
        <NFormItem :label="t('preferences.clipboard-thunder')">
          <NSwitch v-model:value="form.clipboardThunder" />
        </NFormItem>
        <NFormItem :label="t('preferences.clipboard-bt-hash')">
          <NSwitch v-model:value="form.clipboardBtHash" />
        </NFormItem>
      </NCollapseTransition>

      <!-- ── Default Programs (all platforms) ─────────────────────── -->
      <NDivider title-placement="left">{{ t('preferences.default-programs') }}</NDivider>
      <NFormItem :label="t('preferences.protocol-magnet')">
        <NSwitch v-model:value="form.protocolMagnet" />
      </NFormItem>
      <NFormItem :label="t('preferences.protocol-thunder')">
        <NSwitch v-model:value="form.protocolThunder" />
      </NFormItem>
      <NFormItem :label="t('preferences.protocol-motrixnext')">
        <NSwitch v-model:value="form.protocolMotrixnext" />
      </NFormItem>
    </NForm>
    <PreferenceActionBar :is-dirty="isDirty" @save="handleSave" @discard="handleReset" @restart="handleManualRestart" />
  </div>
</template>

<style scoped>
.preference-form-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.form-preference {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 30px 64px 36px;
}
.form-preference :deep(.n-form-item) {
  padding-left: 50px;
}
.form-actions {
  padding: 16px 24px 16px 40px;
}

/* ── System info version badge (matches About panel) ─────────────── */
.sysinfo-ver-badge {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--m3-outline-variant, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  background: var(--about-card-bg, rgba(255, 255, 255, 0.03));
  cursor: pointer;
  transition: var(--transition-all, 0.2s ease);
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace;
}
.sysinfo-ver-badge:hover {
  border-color: var(--color-primary);
  background: var(--about-card-hover-bg, rgba(255, 255, 255, 0.06));
}
.sysinfo-ver-badge:hover .sysinfo-ver-copy {
  opacity: 0.7;
}
.sysinfo-ver-badge:active {
  transform: scale(0.97);
}
.sysinfo-ver-value {
  font-size: 13px;
  font-weight: 520;
  color: var(--m3-on-surface, rgba(255, 255, 255, 0.9));
  letter-spacing: 0.3px;
}
.sysinfo-ver-copy {
  opacity: 0.35;
  margin-left: auto;
  color: var(--m3-on-surface-variant, rgba(255, 255, 255, 0.5));
  transition: var(--transition-all, 0.2s ease);
  flex-shrink: 0;
}
.sysinfo-ver-badge--muted {
  cursor: default;
}
.sysinfo-ver-badge--muted:hover {
  border-color: var(--m3-outline-variant, rgba(255, 255, 255, 0.08));
  background: var(--about-card-bg, rgba(255, 255, 255, 0.03));
}
.sysinfo-ver-muted {
  font-size: 12px;
  font-weight: 500;
  color: var(--m3-outline, rgba(255, 255, 255, 0.38));
  letter-spacing: 0.3px;
}

/* ── Collapse indent: subordinate toggle hierarchy indicator ──────── */
.form-preference :deep(.collapse-indent) {
  position: relative;
  margin-left: 16px;
}

/* ── Schedule warning slide-fade transition ──────────────────────── */
.schedule-warn-enter-active,
.schedule-warn-leave-active {
  transition:
    opacity 0.25s cubic-bezier(0.2, 0, 0, 1),
    transform 0.25s cubic-bezier(0.2, 0, 0, 1),
    max-height 0.25s cubic-bezier(0.2, 0, 0, 1);
  overflow: hidden;
}
.schedule-warn-enter-from,
.schedule-warn-leave-to {
  opacity: 0;
  transform: translateY(-8px);
  max-height: 0;
}
.schedule-warn-enter-to,
.schedule-warn-leave-from {
  max-height: 60px;
}

/* ── Color Scheme Swatch Picker ───────────────────────────────────── */
.color-scheme-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.color-swatch {
  position: relative;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  background: var(--swatch-color);
  cursor: pointer;
  transition:
    transform 0.2s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.2s cubic-bezier(0.2, 0, 0, 1),
    box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  padding: 0;
}
.color-swatch:hover {
  transform: scale(1.18);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.color-swatch:active {
  transform: scale(1.05);
}
.color-swatch.active {
  border-color: var(--m3-on-surface, #fff);
  box-shadow:
    0 0 0 2px var(--swatch-color),
    0 2px 8px rgba(0, 0, 0, 0.25);
}
.swatch-check {
  width: 14px;
  height: 14px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}

/* ── File Category List ──────────────────────────────────────────── */
.file-category-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
  width: 100%;
}
.file-category-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.file-category-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--n-color, var(--m3-surface-container-low));
  border: 1px solid var(--n-border-color, var(--m3-outline-variant));
  transition: border-color 0.2s ease;
}
.file-category-card:hover {
  border-color: var(--color-primary);
}
.file-category-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.file-category-label {
  font-size: 13px;
  font-weight: 500;
}
.file-category-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
}

/* ── Ghost button danger — tinted hover for dark mode (matches Advanced.vue) ── */
.ghost-btn--danger {
  --btn-tint: var(--m3-error, #c97070);
  color: var(--btn-tint) !important;
  border-color: var(--btn-tint) !important;
  transition:
    color 0.35s cubic-bezier(0.2, 0, 0, 1),
    background-color 0.35s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.35s cubic-bezier(0.2, 0, 0, 1);
}
.ghost-btn--danger:hover {
  background-color: color-mix(in srgb, var(--btn-tint) 12%, transparent) !important;
}
.ghost-btn--danger :deep(.n-button__border),
.ghost-btn--danger :deep(.n-button__state-border) {
  border-color: var(--btn-tint) !important;
  transition: border-color 0.35s cubic-bezier(0.2, 0, 0, 1);
}
</style>
