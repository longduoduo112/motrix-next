<script setup lang="ts">
/** @fileoverview Modal dialog for selecting files from a magnet link's metadata.
 *
 * Displayed after aria2 downloads the metadata (info dict) for a magnet URI.
 * Uses NDataTable file selection pattern consistent with torrent upload in AddTask.
 *
 * Props:
 * - show: controls visibility
 * - files: parsed MagnetFileItem[] from useMagnetFlow.parseFilesForSelection
 * - taskName: display name for the dialog
 *
 * Emits:
 * - confirm(selectedIndices: number[]): user confirmed — download selected files
 * - cancel: user chose to delete the download entirely
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NModal, NCard, NDataTable, NButton, NSpace, NTag } from 'naive-ui'
import { bytesToSize } from '@shared/utils'
import type { DataTableColumns, DataTableRowKey } from 'naive-ui'
import type { MagnetFileItem } from '@/composables/useMagnetFlow'

const props = defineProps<{
  show: boolean
  files: MagnetFileItem[]
  taskName: string
}>()

const emit = defineEmits<{
  confirm: [selectedIndices: number[]]
  cancel: []
}>()

const { t } = useI18n()

// Selected row keys (file indices as numbers)
const checkedKeys = ref<DataTableRowKey[]>([])

// Select all files by default when files change
watch(
  () => props.files,
  (files) => {
    checkedKeys.value = files.map((f) => f.index)
  },
  { immediate: true },
)

const columns = computed<DataTableColumns>(() => [
  { type: 'selection' },
  {
    title: '#',
    key: 'index',
    width: 50,
  },
  {
    title: t('task.file-name') || 'File Name',
    key: 'name',
    ellipsis: { tooltip: true },
  },
  {
    title: t('task.file-size') || 'Size',
    key: 'length',
    width: 110,
    render(row: Record<string, unknown>) {
      return bytesToSize(row.length as number)
    },
  },
])

const totalSize = computed(() => {
  const selected = new Set(checkedKeys.value)
  return props.files.filter((f) => selected.has(f.index)).reduce((sum, f) => sum + f.length, 0)
})

const hasSelection = computed(() => checkedKeys.value.length > 0)

function handleConfirm() {
  emit('confirm', checkedKeys.value as number[])
}

function handleDelete() {
  emit('cancel')
}
</script>

<template>
  <NModal :show="show" :mask-closable="false" @update:show="(v) => !v && handleDelete()">
    <NCard
      :title="taskName || t('task.select-files') || 'Select Files'"
      :bordered="false"
      :closable="true"
      role="dialog"
      class="magnet-file-select-card"
      @close="handleDelete"
    >
      <NDataTable
        :columns="columns"
        :data="files"
        :row-key="(row: MagnetFileItem) => row.index"
        :checked-row-keys="checkedKeys"
        :max-height="360"
        size="small"
        @update:checked-row-keys="(keys: DataTableRowKey[]) => (checkedKeys = keys)"
      />

      <template #footer>
        <NSpace justify="space-between" align="center">
          <NTag :bordered="false" type="info" size="small">
            {{ checkedKeys.length }}/{{ files.length }} — {{ bytesToSize(totalSize) }}
          </NTag>
          <NSpace>
            <NButton size="small" type="error" :ghost="true" @click="handleDelete">
              {{ t('task.magnet-delete-download') || 'Delete Download' }}
            </NButton>
            <NButton type="primary" size="small" :disabled="!hasSelection" @click="handleConfirm">
              {{ t('task.magnet-start-download') || 'Start Download' }}
            </NButton>
          </NSpace>
        </NSpace>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.magnet-file-select-card {
  width: 640px;
  max-width: 90vw;
}
</style>
