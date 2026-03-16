/**
 * @fileoverview M3 batch-item animation hooks for AddTask dialog.
 *
 * Extracted from AddTask.vue to reduce component script size.
 * Uses Material Design 3 emphasized easing curves for enter/leave transitions
 * on the file batch list TransitionGroup.
 */
import type { Ref } from 'vue'
import type { ComputedRef } from 'vue'
import type { BatchItem } from '@shared/types'

/** M3 emphasized decelerate easing for enter animations. */
const M3_DECELERATE = 'cubic-bezier(0.2, 0, 0, 1)'
/** M3 accelerate easing for exit animations. */
const M3_ACCELERATE = 'cubic-bezier(0.3, 0, 0.8, 0.15)'

export function onBatchItemBeforeEnter(el: Element) {
  const htmlEl = el as HTMLElement
  htmlEl.style.opacity = '0'
  htmlEl.style.transform = 'translateX(-12px)'
}

export function onBatchItemEnter(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement
  const anim = htmlEl.animate(
    [
      { opacity: 0, transform: 'translateX(-12px)' },
      { opacity: 1, transform: 'translateX(0)' },
    ],
    { duration: 220, easing: M3_DECELERATE, fill: 'forwards' },
  )
  anim.onfinish = () => {
    htmlEl.style.opacity = ''
    htmlEl.style.transform = ''
    done()
  }
}

export function onBatchItemLeave(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement
  const startHeight = htmlEl.offsetHeight
  htmlEl.style.overflow = 'hidden'
  const anim = htmlEl.animate(
    [
      { opacity: 1, height: `${startHeight}px` },
      { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px' },
    ],
    { duration: 150, easing: M3_ACCELERATE, fill: 'forwards' },
  )
  anim.onfinish = done
}

export function createBatchItemAfterLeave(
  fileItems: ComputedRef<BatchItem[]>,
  batchListRef: Ref<HTMLElement | null>,
  showBatchList: Ref<boolean>,
) {
  return function onBatchItemAfterLeave() {
    if (fileItems.value.length === 0 && batchListRef.value) {
      const el = batchListRef.value
      const h = el.offsetHeight
      el.animate(
        [
          { height: `${h}px`, marginBottom: '8px', opacity: 1 },
          { height: '0px', marginBottom: '0px', opacity: 0 },
        ],
        { duration: 150, easing: M3_ACCELERATE, fill: 'forwards' },
      ).onfinish = () => {
        showBatchList.value = false
        el.getAnimations().forEach((a) => a.cancel())
      }
    }
  }
}
