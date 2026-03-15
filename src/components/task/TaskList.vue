<script setup lang="ts">
/** @fileoverview Scrollable task list container with empty state. */
import { ref, computed, watch } from 'vue'
import { useTaskStore } from '@/stores/task'
import { useTheme } from '@/composables/useTheme'
import TaskItem from './TaskItem.vue'
import type { Aria2Task } from '@shared/types'
import watermarkDark from '@/assets/logo-bolt-dark.png'
import watermarkLight from '@/assets/logo-bolt-light.png'

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

const taskStore = useTaskStore()
const { isDark } = useTheme()
const watermarkSrc = computed(() => (isDark.value ? watermarkLight : watermarkDark))

// ── Task list with immediate watermark ───────────────────────────────
// The watermark is rendered from the FIRST frame when the task list is
// empty.  The route-level <Transition name="fade"> handles the visual
// fade-in on page mount.  The watermark's own <Transition> only plays
// for in-page empty↔non-empty changes (e.g. deleting the last task).

const taskList = ref<Aria2Task[]>(taskStore.taskList)
const selectedGidList = computed(() => taskStore.selectedGidList)

watch(
  () => taskStore.taskList,
  (v) => {
    taskList.value = v
  },
)

function isSelected(gid: string) {
  return selectedGidList.value.includes(gid)
}

function handleItemClick(task: Aria2Task, event: MouseEvent) {
  const gid = task.gid
  const list = [...selectedGidList.value]
  if (event.metaKey || event.ctrlKey) {
    const idx = list.indexOf(gid)
    if (idx === -1) list.push(gid)
    else list.splice(idx, 1)
  } else {
    list.length = 0
    list.push(gid)
  }
  taskStore.selectTasks(list)
}
</script>

<template>
  <div class="task-list" :class="{ 'is-empty': taskList.length === 0 }">
    <TransitionGroup name="task-list" tag="div" class="task-list-inner">
      <div
        v-for="item in taskList"
        :key="item.gid"
        :class="{ selected: isSelected(item.gid) }"
        class="task-list-item"
        @click="handleItemClick(item, $event)"
      >
        <TaskItem
          :task="item"
          @pause="emit('pause', item)"
          @resume="emit('resume', item)"
          @delete="emit('delete', item)"
          @delete-record="emit('delete-record', item)"
          @copy-link="emit('copy-link', item)"
          @show-info="emit('show-info', item)"
          @folder="emit('folder', item)"
          @stop-seeding="emit('stop-seeding', item)"
        />
      </div>
    </TransitionGroup>
    <Transition name="watermark">
      <div v-if="taskList.length === 0" class="no-task" @dragstart.prevent @selectstart.prevent>
        <div class="no-task-inner">
          <img :src="watermarkSrc" alt="Motrix Next" class="no-task-brand" draggable="false" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.task-list {
  padding: 16px 36px 16px;
  min-height: 100%;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
}
/*
 * Speedometer clearance spacer — only when cards are present.
 * padding-bottom on a flex + overflow:auto parent is ignored by browsers
 * (known CSS bug). A ::after pseudo-element participates in flex layout,
 * reliably reserving space above the fixed Speedometer widget.
 */
.task-list:not(.is-empty)::after {
  content: '';
  display: block;
  flex: 0 0 50px;
}
.task-list-inner {
  position: relative;
}
.selected :deep(.task-item) {
  border-color: var(--task-item-hover-border);
}
.task-list-item {
  margin-bottom: 16px;
}
.task-list-enter-active {
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
}
.task-list-leave-active {
  transition: all 0.2s cubic-bezier(0.3, 0, 0.8, 0.15);
  position: absolute;
  width: 100%;
}
.task-list-enter-from {
  opacity: 0;
  transform: translateY(24px) scale(0.97);
}
.task-list-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.97);
}
.task-list-move {
  transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
}
.no-task {
  display: flex;
  flex: 1;
  text-align: center;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.no-task-inner {
  width: 100%;
}
.no-task-brand {
  max-width: 480px;
  width: 80%;
  opacity: 0.35;
  user-select: none;
  -webkit-user-drag: none;
}

/* ── Watermark transition — unique name avoids collision with the   ── */
/* ── global "fade" classes used by the route-level <Transition>.   ── */
/* ── GPU-only: animates opacity exclusively (no layout/paint).     ── */
.watermark-enter-active {
  transition: opacity 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.watermark-leave-active {
  transition: opacity 0.15s cubic-bezier(0.3, 0, 0.8, 0.15);
}
.watermark-enter-from,
.watermark-leave-to {
  opacity: 0;
}
</style>
