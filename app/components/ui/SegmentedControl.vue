<script setup lang="ts">
import type { Component } from 'vue'

interface Option {
  value: string
  label: string
  icon?: Component
}

interface Props {
  modelValue: string
  options: Option[]
  size?: 'sm' | 'md'
}

withDefaults(defineProps<Props>(), {
  size: 'md',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function select(value: string) {
  emit('update:modelValue', value)
}
</script>

<template>
  <div
    class="inline-flex items-center p-1 rounded-lg bg-bg-secondary border border-border-subtle"
    role="tablist"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === option.value"
      class="relative px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200"
      :class="[
        modelValue === option.value
          ? 'text-text-primary bg-bg-tertiary shadow-sm'
          : 'text-text-secondary hover:text-text-primary',
        size === 'sm' ? 'text-xs px-2 py-1' : ''
      ]"
      @click="select(option.value)"
    >
      <span class="flex items-center gap-1.5">
        <component
          :is="option.icon"
          v-if="option.icon"
          class="w-3.5 h-3.5"
        />
        {{ option.label }}
      </span>
    </button>
  </div>
</template>
