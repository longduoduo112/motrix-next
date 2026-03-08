<script setup lang="ts">
/** @fileoverview Individual task row in the task list with progress and controls. */
import { computed, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { TASK_STATUS } from '@shared/constants'
import {
  checkTaskIsSeeder,
  getTaskName,
  calcProgress,
  bytesToSize,
  timeRemaining,
  timeFormat,
  checkTaskIsBT,
} from '@shared/utils'
import { exists } from '@tauri-apps/plugin-fs'
import { logger } from '@shared/logger'
import { NProgress, NIcon } from 'naive-ui'
import {
  ArrowUpOutline,
  ArrowDownOutline,
  GitNetworkOutline,
  MagnetOutline,
  AlertCircleOutline,
  CloudUploadOutline,
  CheckmarkCircleOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import TaskItemActions from './TaskItemActions.vue'
import type { Aria2Task } from '@shared/types'

const props = defineProps<{ task: Aria2Task }>()
const emit = defineEmits<{
  pause: [task: Aria2Task]
  resume: [task: Aria2Task]
  delete: [task: Aria2Task]
  'delete-record': [task: Aria2Task]
  'copy-link': [task: Aria2Task]
  'show-info': [task: Aria2Task]
  folder: [task: Aria2Task]
  'stop-seeding': [task: Aria2Task]
}>()

const { t } = useI18n()

const taskFullName = computed(() => getTaskName(props.task, { defaultName: t('task.get-task-name') || 'Unknown' }))

const isSeeder = computed(() => checkTaskIsSeeder(props.task))
const isBT = computed(() => checkTaskIsBT(props.task))
const taskStatus = computed(() => (isSeeder.value ? TASK_STATUS.SEEDING : props.task.status))
const isActive = computed(() => props.task.status === TASK_STATUS.ACTIVE)

const percent = computed(() => calcProgress(props.task.totalLength, props.task.completedLength))
const completedSize = computed(() => bytesToSize(props.task.completedLength, 2))
const totalSize = computed(() => bytesToSize(props.task.totalLength, 2))
const downloadSpeed = computed(() => bytesToSize(props.task.downloadSpeed))
const uploadSpeed = computed(() => bytesToSize(props.task.uploadSpeed))

const remaining = computed(() => {
  if (!isActive.value) return 0
  return timeRemaining(
    Number(props.task.totalLength),
    Number(props.task.completedLength),
    Number(props.task.downloadSpeed),
  )
})

const remainingText = computed(() => {
  if (remaining.value <= 0) return ''
  return timeFormat(remaining.value, {
    prefix: t('task.remaining-prefix') || '',
    i18n: {
      gt1d: t('app.gt1d') || '>1d',
      hour: t('app.hour') || 'h',
      minute: t('app.minute') || 'm',
      second: t('app.second') || 's',
    },
  })
})

/** Reads a CSS variable from :root, returning the fallback if unavailable. */
function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

const statusColorMap = computed<Record<string, string>>(() => ({
  active: cssVar('--m3-status-active', '#E0A422'),
  waiting: cssVar('--m3-status-waiting', '#E6A23C'),
  paused: cssVar('--m3-status-paused', '#909399'),
  error: cssVar('--m3-status-error', '#F56C6C'),
  complete: cssVar('--m3-status-success', '#67C23A'),
  removed: cssVar('--m3-status-paused', '#909399'),
  seeding: cssVar('--m3-status-success', '#67C23A'),
}))

const progressColor = computed(() => statusColorMap.value[taskStatus.value] || cssVar('--m3-status-active', '#E0A422'))

const finishedTag = computed(() => {
  const s = props.task.status
  if (s === TASK_STATUS.COMPLETE)
    return {
      label: t('task.task-complete') || 'Completed',
      color: cssVar('--m3-status-success', '#67C23A'),
      icon: CheckmarkCircleOutline,
    }
  if (s === TASK_STATUS.ERROR)
    return {
      label: t('task.task-error') || 'Error',
      color: cssVar('--m3-status-error', '#F56C6C'),
      icon: AlertCircleOutline,
    }
  if (s === TASK_STATUS.REMOVED)
    return {
      label: t('task.task-removed') || 'Removed',
      color: cssVar('--m3-status-paused', '#909399'),
      icon: TrashOutline,
    }
  return null
})

function onDblClick() {
  const s = props.task.status
  if (s === TASK_STATUS.COMPLETE) return
  if (s === TASK_STATUS.ACTIVE) emit('pause', props.task)
  else if (s === TASK_STATUS.WAITING || s === TASK_STATUS.PAUSED) emit('resume', props.task)
}

// File missing detection for completed/stopped tasks
const fileMissing = ref(false)

async function checkFileExists() {
  const status = props.task.status
  if (status === TASK_STATUS.ACTIVE || status === TASK_STATUS.WAITING) {
    fileMissing.value = false
    return
  }
  const dir = props.task.dir
  const files = props.task.files
  if (!files || files.length === 0 || !dir) {
    fileMissing.value = false
    return
  }
  try {
    const firstFile = files[0]?.path
    if (firstFile) {
      fileMissing.value = !(await exists(firstFile))
    }
  } catch (e) {
    logger.debug('TaskItem.fileCheck', e)
    fileMissing.value = false
  }
}

onMounted(checkFileExists)
watch(() => props.task.status, checkFileExists)
</script>

<template>
  <div class="task-item" :class="{ 'file-missing': fileMissing, 'is-seeding': isSeeder }" @dblclick="onDblClick">
    <div class="task-name" :title="taskFullName">
      <span>{{ taskFullName }}</span>
      <div v-if="isSeeder || finishedTag || fileMissing" class="task-tags">
        <span v-if="isSeeder" class="seeding-tag">
          <NIcon :size="13"><CloudUploadOutline /></NIcon>
          {{ t('task.seeding') || 'Seeding' }}
        </span>
        <span v-else-if="finishedTag" class="status-tag" :style="{ color: finishedTag.color }">
          <NIcon :size="13"><component :is="finishedTag.icon" /></NIcon>
          {{ finishedTag.label }}
        </span>
        <span v-if="fileMissing" class="file-missing-tag">
          <NIcon :size="13"><AlertCircleOutline /></NIcon>
          {{ t('task.file-missing') || 'File missing' }}
        </span>
      </div>
    </div>
    <TaskItemActions
      :task="task"
      :status="taskStatus"
      @pause="emit('pause', task)"
      @resume="emit('resume', task)"
      @delete="emit('delete', task)"
      @delete-record="emit('delete-record', task)"
      @copy-link="emit('copy-link', task)"
      @show-info="emit('show-info', task)"
      @folder="emit('folder', task)"
      @stop-seeding="emit('stop-seeding', task)"
    />
    <div class="task-progress">
      <NProgress
        type="line"
        :percentage="percent"
        :color="progressColor"
        :rail-color="undefined"
        :height="6"
        :border-radius="3"
        :show-indicator="false"
        :processing="isActive"
      />
      <div class="task-progress-info">
        <div class="progress-left">
          <span v-if="Number(task.completedLength) > 0 || Number(task.totalLength) > 0">
            {{ completedSize }}
            <span v-if="Number(task.totalLength) > 0"> / {{ totalSize }}</span>
          </span>
        </div>
        <div v-if="isActive" class="progress-right">
          <span v-if="isBT" class="speed-text">
            <NIcon :size="10"><ArrowUpOutline /></NIcon>
            <span>{{ uploadSpeed }}/s</span>
          </span>
          <span class="speed-text">
            <NIcon :size="10"><ArrowDownOutline /></NIcon>
            <span>{{ downloadSpeed }}/s</span>
          </span>
          <span v-if="remaining > 0" class="speed-text">
            <span>{{ remainingText }}</span>
          </span>
          <span v-if="isBT" class="speed-text">
            <NIcon :size="10"><MagnetOutline /></NIcon>
            <span>{{ task.numSeeders }}</span>
          </span>
          <span class="speed-text">
            <NIcon :size="10"><GitNetworkOutline /></NIcon>
            <span>{{ task.connections }}</span>
          </span>
        </div>
        <div v-if="task.errorMessage" class="error-message">{{ task.errorMessage }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-item {
  position: relative;
  min-height: 78px;
  padding: 16px 12px;
  background-color: var(--task-item-bg);
  border: 1px solid var(--task-item-border);
  border-radius: 6px;
  transition: border-color 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.task-item:hover {
  border-color: var(--task-item-hover-border);
}
.task-name {
  color: var(--task-item-text);
  margin-bottom: 1.5rem;
  margin-right: 250px;
  overflow: hidden;
  min-height: 26px;
}
.task-name > span {
  font-size: 14px;
  line-height: 26px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
}
.file-missing-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  color: var(--m3-error);
  opacity: 0.85;
  vertical-align: middle;
  animation: fade-in 0.3s ease;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.85;
  }
}
.task-item.file-missing {
  border-color: var(--m3-error-container-bg);
}
.task-progress-info {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  font-size: 12px;
  line-height: 14px;
  min-height: 14px;
  color: var(--m3-on-surface-variant);
  margin-top: 8px;
}
.progress-left {
  white-space: nowrap;
}
.progress-right {
  display: flex;
  gap: 8px;
  text-align: right;
  align-items: center;
}
.speed-text {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  line-height: 14px;
  white-space: nowrap;
}
.task-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}
.seeding-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  color: var(--m3-success);
  opacity: 0.9;
  vertical-align: middle;
  animation: fade-in 0.3s ease;
}
.task-item.is-seeding {
  border-left: 3px solid var(--m3-success);
  background: linear-gradient(90deg, color-mix(in srgb, var(--m3-success) 4%, transparent) 0%, transparent 40%);
}
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  opacity: 0.9;
  vertical-align: middle;
  animation: fade-in 0.3s ease;
}
.error-message {
  flex-basis: 100%;
  font-size: 11px;
  color: var(--m3-error);
  margin-top: 4px;
  opacity: 0.85;
  word-break: break-all;
  line-height: 1.4;
}
</style>
