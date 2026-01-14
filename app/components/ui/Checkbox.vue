<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'

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

const checkboxId = computed(() => `checkbox-${Math.random().toString(36).substring(2, 9)}`)

function toggle() {
  if (!props.disabled) {
    emit('update:modelValue', !props.modelValue)
  }
}
</script>

<template>
  <div
    class="flex items-start gap-3 cursor-pointer select-none"
    :class="{ 'opacity-50 cursor-not-allowed': disabled }"
    @click="toggle"
  >
    <button
      :id="checkboxId"
      type="button"
      role="checkbox"
      :aria-checked="modelValue"
      :disabled="disabled"
      class="
        flex-shrink-0 w-5 h-5 mt-0.5
        rounded border-2 transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary
      "
      :class="[
        modelValue
          ? 'bg-accent-primary border-accent-primary'
          : 'bg-transparent border-border-default hover:border-border-strong'
      ]"
      @click.stop="toggle"
    >
      <Check
        v-if="modelValue"
        class="w-full h-full text-white p-0.5"
        :stroke-width="3"
      />
    </button>

    <div v-if="label || description" class="flex-1 min-w-0">
      <label
        v-if="label"
        :for="checkboxId"
        class="text-sm font-medium text-text-primary cursor-pointer"
      >
        {{ label }}
      </label>
      <p v-if="description" class="text-xs text-text-tertiary mt-0.5">
        {{ description }}
      </p>
    </div>
  </div>
</template>
