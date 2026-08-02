<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  items: { type: Array, required: true },
  estimatedItemHeight: { type: Number, default: 80 },
  buffer: { type: Number, default: 2 }
})

const containerRef = ref(null)
const scrollTop = ref(0)
const containerHeight = ref(500)

// heights[i] = actual measured height of item i, initialized to estimated
const heights = ref([])

// Reset when session switches (items array reference changes)
watch(() => props.items, (newItems) => {
  heights.value = newItems.map(() => props.estimatedItemHeight)
}, { immediate: true })

// Extend when new messages arrive in same session
watch(() => props.items.length, (newLen) => {
  while (heights.value.length < newLen) heights.value.push(props.estimatedItemHeight)
})

// prefixSums[i] = top offset of item i = sum of heights[0..i-1]
const prefixSums = computed(() => {
  const h = heights.value
  const ps = new Array(h.length)
  if (h.length === 0) return ps
  ps[0] = 0
  for (let i = 1; i < h.length; i++) ps[i] = ps[i - 1] + h[i - 1]
  return ps
})

const totalHeight = computed(() => {
  const n = heights.value.length
  return n === 0 ? 0 : prefixSums.value[n - 1] + heights.value[n - 1]
})

// Binary search: first index where bottom (prefixSums[i] + heights[i]) > scrollTop
function findStartIndex(st) {
  const ps = prefixSums.value
  const h = heights.value
  if (ps.length === 0) return 0
  let lo = 0, hi = ps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ps[mid] + h[mid] <= st) lo = mid + 1
    else hi = mid
  }
  return Math.max(0, lo - props.buffer)
}

const startIndex = computed(() => findStartIndex(scrollTop.value))

const endIndex = computed(() => {
  const ps = prefixSums.value
  const viewBottom = scrollTop.value + containerHeight.value
  let i = startIndex.value
  while (i < ps.length && ps[i] < viewBottom) i++
  return Math.min(i + props.buffer, props.items.length)
})

const visibleItems = computed(() => props.items.slice(startIndex.value, endIndex.value))
const offsetTop = computed(() => prefixSums.value[startIndex.value] ?? 0)

const onScroll = (e) => { scrollTop.value = e.target.scrollTop }

// ResizeObserver: correct heights as items render or grow during streaming
let ro = null
let containerRO = null
// Map<Element, itemIndex> — tracks which element corresponds to which item
const observedMap = new Map()

const setItemRef = (el, localIndex) => {
  if (!el || !ro) return
  const actualIndex = startIndex.value + localIndex
  observedMap.set(el, actualIndex)
  ro.observe(el)
}

onMounted(() => {
  containerHeight.value = containerRef.value?.clientHeight ?? 500

  containerRO = new ResizeObserver(([entry]) => {
    containerHeight.value = entry.contentRect.height
  })
  containerRO.observe(containerRef.value)

  ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      const idx = observedMap.get(entry.target)
      if (idx === undefined) continue
      const newH = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
      if (newH > 0 && heights.value[idx] !== newH) heights.value[idx] = newH
    }
  })
})

onBeforeUnmount(() => {
  ro?.disconnect()
  containerRO?.disconnect()
})

const scrollToBottom = () => {
  if (containerRef.value) containerRef.value.scrollTop = containerRef.value.scrollHeight
}

defineExpose({ scrollToBottom })
</script>

<template>
  <div ref="containerRef" class="virtual-list" @scroll.passive="onScroll">
    <div :style="{ height: totalHeight + 'px', position: 'relative' }">
      <div :style="{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${offsetTop}px)` }">
        <div
          v-for="(item, i) in visibleItems"
          :key="item.id"
          :ref="el => setItemRef(el, i)"
        >
          <slot :item="item" :index="startIndex + i" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-list {
  overflow-y: auto;
  position: absolute;
  inset: 0;
}
</style>
