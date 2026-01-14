<script setup lang="ts">
import { computed, ref } from 'vue'
import { Database, Slash, MoreHorizontal } from 'lucide-vue-next'

interface BreadcrumbSegment {
  label: string
  path: string
}

interface Props {
  bucket: string
  prefix: string
  maxVisible?: number
}

const props = withDefaults(defineProps<Props>(), {
  maxVisible: 4, // bucket + 3 path segments before collapsing
})

const emit = defineEmits<{
  navigate: [path: string]
}>()

const showCollapsedMenu = ref(false)

/**
 * Parses bucket and prefix into clickable breadcrumb segments.
 * Each segment includes a cumulative path for navigation.
 */
const allSegments = computed<BreadcrumbSegment[]>(() => {
  const result: BreadcrumbSegment[] = []

  // Always start with bucket as root
  result.push({
    label: props.bucket,
    path: '',
  })

  // Split prefix into parts and build cumulative paths
  if (props.prefix) {
    const parts = props.prefix.split('/').filter(Boolean)
    let cumulative = ''

    for (const part of parts) {
      cumulative += part + '/'
      result.push({
        label: part,
        path: cumulative,
      })
    }
  }

  return result
})

/** Determines if breadcrumb count exceeds maxVisible threshold */
const shouldCollapse = computed(() => allSegments.value.length > props.maxVisible)

/**
 * Returns segments to display: bucket + last 2 when collapsed,
 * or all segments when under the threshold.
 */
const visibleSegments = computed(() => {
  if (!shouldCollapse.value) {
    return allSegments.value
  }

  // Show: bucket, ..., last 2 segments
  const first = allSegments.value[0]
  const lastTwo = allSegments.value.slice(-2)

  return [first, ...lastTwo]
})

/** Returns hidden middle segments for the ellipsis dropdown menu */
const collapsedSegments = computed(() => {
  if (!shouldCollapse.value) return []
  // Everything except first and last 2
  return allSegments.value.slice(1, -2)
})

/**
 * Handles breadcrumb segment clicks for navigation.
 * Ignores clicks on the current (last) segment.
 * @param { BreadcrumbSegment } segment - Clicked segment
 * @param { boolean } isLast - Whether this is the current location
 */
function handleClick(segment: BreadcrumbSegment, isLast: boolean) {
  // Don't navigate if clicking the last segment (current location)
  if (isLast) return
  emit('navigate', segment.path)
  showCollapsedMenu.value = false
}

/** Toggles the collapsed segments dropdown menu */
function toggleCollapsedMenu() {
  showCollapsedMenu.value = !showCollapsedMenu.value
}

/** Closes the collapsed segments dropdown when clicking outside */
function closeCollapsedMenu() {
  showCollapsedMenu.value = false
}
</script>

<template>
  <nav class="flex items-center gap-1 text-sm min-w-0" aria-label="Breadcrumb" @click.self="closeCollapsedMenu">
    <!-- Home link to buckets -->
    <NuxtLink
      to="/buckets"
      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors group flex-shrink-0"
    >
      <Database class="w-4 h-4 group-hover:text-accent-primary transition-colors" />
      <span class="hidden sm:inline text-xs font-medium uppercase tracking-wide">Buckets</span>
    </NuxtLink>

    <!-- Separator -->
    <span class="text-text-tertiary mx-0.5 flex-shrink-0">
      <Slash class="w-4 h-4 -rotate-12" />
    </span>

    <!-- Non-collapsed view -->
    <template v-if="!shouldCollapse">
      <template v-for="(segment, index) in allSegments" :key="index">
        <button
          type="button"
          :class="[
            'px-2.5 py-1.5 rounded-md font-mono text-sm transition-all truncate max-w-48',
            index === allSegments.length - 1
              ? 'text-text-primary bg-bg-tertiary border border-border-subtle font-medium'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover cursor-pointer'
          ]"
          :disabled="index === allSegments.length - 1"
          :title="segment.label"
          @click="handleClick(segment, index === allSegments.length - 1)"
        >
          {{ segment.label }}
        </button>

        <!-- Separator -->
        <span
          v-if="index < allSegments.length - 1"
          class="text-text-tertiary mx-0.5 flex-shrink-0"
        >
          <Slash class="w-4 h-4 -rotate-12" />
        </span>
      </template>
    </template>

    <!-- Collapsed view -->
    <template v-else>
      <!-- First segment (bucket) -->
      <button
        v-if="visibleSegments[0]"
        type="button"
        class="px-2.5 py-1.5 rounded-md font-mono text-sm transition-all text-text-secondary hover:text-text-primary hover:bg-bg-hover cursor-pointer truncate max-w-32"
        :title="visibleSegments[0].label"
        @click="handleClick(visibleSegments[0], false)"
      >
        {{ visibleSegments[0].label }}
      </button>

      <!-- Separator -->
      <span class="text-text-tertiary mx-0.5 flex-shrink-0">
        <Slash class="w-4 h-4 -rotate-12" />
      </span>

      <!-- Ellipsis dropdown -->
      <div class="relative flex-shrink-0">
        <button
          type="button"
          class="px-2 py-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
          :title="`${collapsedSegments.length} hidden segments`"
          @click.stop="toggleCollapsedMenu"
        >
          <MoreHorizontal class="w-4 h-4" />
        </button>

        <!-- Dropdown menu -->
        <Transition
          enter-active-class="transition-all duration-150 ease-out"
          leave-active-class="transition-all duration-100 ease-in"
          enter-from-class="opacity-0 scale-95 -translate-y-1"
          leave-to-class="opacity-0 scale-95 -translate-y-1"
        >
          <div
            v-if="showCollapsedMenu"
            class="absolute top-full left-0 mt-1 z-50 bg-bg-tertiary border border-border-default rounded-lg shadow-xl py-1 min-w-48 max-w-72"
          >
            <button
              v-for="segment in collapsedSegments"
              :key="segment.path"
              type="button"
              class="w-full px-3 py-2 text-left text-sm font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors truncate"
              :title="segment.label"
              @click="handleClick(segment, false)"
            >
              {{ segment.label }}
            </button>
          </div>
        </Transition>
      </div>

      <!-- Separator -->
      <span class="text-text-tertiary mx-0.5 flex-shrink-0">
        <Slash class="w-4 h-4 -rotate-12" />
      </span>

      <!-- Last two segments -->
      <template v-for="(segment, index) in visibleSegments.slice(1)" :key="segment?.path ?? index">
        <template v-if="segment">
          <button
            type="button"
            :class="[
              'px-2.5 py-1.5 rounded-md font-mono text-sm transition-all truncate max-w-40',
              index === visibleSegments.length - 2
                ? 'text-text-primary bg-bg-tertiary border border-border-subtle font-medium'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover cursor-pointer'
            ]"
            :disabled="index === visibleSegments.length - 2"
            :title="segment.label"
            @click="handleClick(segment, index === visibleSegments.length - 2)"
          >
            {{ segment.label }}
          </button>

          <!-- Separator -->
          <span
            v-if="index < visibleSegments.length - 2"
            class="text-text-tertiary mx-0.5 flex-shrink-0"
          >
            <Slash class="w-4 h-4 -rotate-12" />
          </span>
        </template>
      </template>
    </template>
  </nav>

  <!-- Click-outside overlay -->
  <div
    v-if="showCollapsedMenu"
    class="fixed inset-0 z-40"
    @click="closeCollapsedMenu"
  />
</template>
