<script setup lang="ts">
import { ref, computed, useSlots } from 'vue'
import { useConnectionStore } from '~/stores/connection'

defineProps<{
  title?: string
  showEndpoint?: boolean
  fullWidth?: boolean
  noPadding?: boolean
}>()

const slots = useSlots()
const store = useConnectionStore()
const sidebarCollapsed = ref(false)

const mainPadding = computed(() => sidebarCollapsed.value ? 'pl-16' : 'pl-60')
const hasCustomHeader = computed(() => !!slots['header'])
</script>

<template>
  <div class="min-h-screen bg-bg-primary">
    <!-- Sidebar -->
    <LayoutSidebar v-model:collapsed="sidebarCollapsed" />

    <!-- Main content area -->
    <div :class="['transition-all duration-200 min-h-screen flex flex-col', mainPadding]">
      <!-- Custom header slot (replaces default header entirely) -->
      <slot v-if="hasCustomHeader" name="header" />

      <!-- Default header -->
      <header
        v-else
        class="sticky top-0 z-40 bg-bg-primary/95 backdrop-blur-md border-b border-border-subtle"
      >
        <div class="px-6 py-4">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-xl font-semibold text-text-primary">{{ title }}</h1>
              <p v-if="showEndpoint" class="text-xs text-text-secondary font-mono">
                {{ store.displayEndpoint }}
              </p>
            </div>

            <div class="flex items-center gap-3">
              <slot name="actions" />
            </div>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main :class="[noPadding ? '' : 'p-6', fullWidth ? '' : 'max-w-[1800px]', 'flex-1']">
        <slot />
      </main>
    </div>
  </div>
</template>
