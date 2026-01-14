<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue: boolean
  label?: string
  description?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const toggleId = computed(() => `toggle-${Math.random().toString(36).substring(2, 9)}`)

function toggle() {
  if (!props.disabled) {
    emit('update:modelValue', !props.modelValue)
  }
}
</script>

<template>
  <div
    class="flex items-center justify-between gap-4 cursor-pointer select-none"
    :class="{ 'opacity-50 cursor-not-allowed': disabled }"
    @click="toggle"
  >
    <div v-if="label || description" class="flex-1 min-w-0">
      <label
        v-if="label"
        :for="toggleId"
        class="text-sm font-medium text-text-primary cursor-pointer"
      >
        {{ label }}
      </label>
      <p v-if="description" class="text-xs text-text-tertiary mt-0.5">
        {{ description }}
      </p>
    </div>

    <button
      :id="toggleId"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      class="
        relative flex-shrink-0 w-11 h-6
        rounded-full transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary
      "
      :class="[
        modelValue
          ? 'bg-accent-primary'
          : 'bg-bg-hover'
      ]"
      @click.stop="toggle"
    >
      <span
        class="
          absolute top-1 left-1
          w-4 h-4 rounded-full
          transition-transform duration-200
          shadow-sm
        "
        :class="[
          modelValue
            ? 'translate-x-5 bg-white'
            : 'translate-x-0 bg-text-tertiary'
        ]"
      />
    </button>
  </div>
</template>
