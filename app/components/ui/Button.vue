<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface Props {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  icon?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  icon: false,
  type: 'button',
})

const classes = computed(() => {
  const base = [
    'inline-flex items-center justify-center gap-2',
    'font-medium transition-all duration-200',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ]

  // Size classes
  const sizeClasses: Record<ButtonSize, string[]> = {
    sm: props.icon
      ? ['w-8 h-8', 'rounded-md']
      : ['h-8 px-3', 'text-sm', 'rounded-md'],
    md: props.icon
      ? ['w-10 h-10', 'rounded-lg']
      : ['h-10 px-4', 'text-sm', 'rounded-lg'],
    lg: props.icon
      ? ['w-12 h-12', 'rounded-lg']
      : ['h-12 px-6', 'text-base', 'rounded-lg'],
  }

  // Variant classes
  const variantClasses: Record<ButtonVariant, string[]> = {
    primary: [
      'bg-accent-primary text-white',
      'hover:bg-[#f06b69]',
      'focus-visible:ring-accent-primary',
      'shadow-md',
      'hover:shadow-glow-primary',
    ],
    secondary: [
      'bg-bg-tertiary text-text-primary',
      'border border-border-default',
      'hover:bg-bg-hover hover:border-border-strong',
      'focus-visible:ring-border-strong',
    ],
    ghost: [
      'text-text-secondary',
      'hover:text-text-primary hover:bg-bg-hover',
      'focus-visible:ring-border-default',
    ],
    danger: [
      'bg-error text-white',
      'hover:bg-[#e53935]',
      'focus-visible:ring-error',
    ],
  }

  return [
    ...base,
    ...sizeClasses[props.size],
    ...variantClasses[props.variant],
  ]
})
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
  >
    <Loader2
      v-if="loading"
      class="w-4 h-4 animate-spin"
    />
    <slot v-else />
  </button>
</template>
