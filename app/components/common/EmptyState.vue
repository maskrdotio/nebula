<script setup lang="ts">
import { computed, type Component } from 'vue'

interface Props {
  icon?: Component
  title: string
  description?: string
  actionLabel?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  action: []
}>()

const hasAction = computed(() => !!props.actionLabel)
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
    <!-- Icon -->
    <div
      v-if="icon"
      class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-subtle flex items-center justify-center mb-4"
    >
      <component :is="icon" class="w-8 h-8 text-text-tertiary" :stroke-width="1.5" />
    </div>

    <!-- Title -->
    <h3 class="text-lg font-medium text-text-primary mb-1">
      {{ title }}
    </h3>

    <!-- Description -->
    <p v-if="description" class="text-sm text-text-secondary max-w-sm">
      {{ description }}
    </p>

    <!-- Action -->
    <div v-if="hasAction" class="mt-6">
      <UiButton variant="primary" @click="emit('action')">
        {{ actionLabel }}
      </UiButton>
    </div>

    <!-- Custom slot for additional content -->
    <slot />
  </div>
</template>
