<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'

interface Props {
  modelValue: string
  label?: string
  placeholder?: string
  type?: 'text' | 'password' | 'email' | 'url'
  error?: string
  hint?: string
  disabled?: boolean
  required?: boolean
  autocomplete?: string
  monospace?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  required: false,
  monospace: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showPassword = ref(false)
const inputId = computed(() => `input-${Math.random().toString(36).substring(2, 9)}`)

const inputType = computed(() => {
  if (props.type === 'password') {
    return showPassword.value ? 'text' : 'password'
  }
  return props.type
})

const inputClasses = computed(() => [
  'w-full h-10 px-3',
  'bg-bg-secondary text-text-primary',
  'border rounded-lg',
  'transition-all duration-200',
  'placeholder:text-text-tertiary',
  'focus:outline-none focus:ring-2 focus:ring-offset-0',
  props.monospace ? 'font-mono text-sm' : 'text-sm',
  props.error
    ? 'border-error focus:ring-error/50 focus:border-error'
    : 'border-border-default focus:ring-accent-primary/50 focus:border-accent-primary',
  props.disabled ? 'opacity-50 cursor-not-allowed' : '',
  props.type === 'password' ? 'pr-10' : '',
])

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div class="space-y-1.5">
    <label
      v-if="label"
      :for="inputId"
      class="block text-sm font-medium text-text-secondary"
    >
      {{ label }}
      <span v-if="required" class="text-accent-primary">*</span>
    </label>

    <div class="relative">
      <input
        :id="inputId"
        :type="inputType"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :autocomplete="autocomplete"
        :class="inputClasses"
        @input="handleInput"
      >

      <button
        v-if="type === 'password'"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-tertiary hover:text-text-secondary transition-colors"
        tabindex="-1"
        @click="showPassword = !showPassword"
      >
        <EyeOff v-if="showPassword" class="w-4 h-4" />
        <Eye v-else class="w-4 h-4" />
      </button>
    </div>

    <p v-if="error" class="text-xs text-error">
      {{ error }}
    </p>
    <p v-else-if="hint" class="text-xs text-text-tertiary">
      {{ hint }}
    </p>
  </div>
</template>
