<script setup lang="ts">
interface Props {
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string
  height?: string
}

withDefaults(defineProps<Props>(), {
  variant: 'rectangular',
})
</script>

<template>
  <div
    class="animate-shimmer rounded"
    :class="{
      'rounded-full': variant === 'circular',
      'rounded-md': variant === 'rectangular',
      'rounded-sm h-4': variant === 'text',
    }"
    :style="{
      width: width ?? '100%',
      height: height ?? (variant === 'text' ? '1rem' : '100%'),
    }"
  />
</template>
