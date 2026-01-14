<script setup lang="ts">
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-vue-next'
import { useToastStore, type ToastType } from '~/stores/toast'

const store = useToastStore()

const iconMap: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const colorMap: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
  success: {
    bg: 'bg-success/10',
    border: 'border-success/30',
    icon: 'text-success',
    text: 'text-success',
  },
  error: {
    bg: 'bg-error/10',
    border: 'border-error/30',
    icon: 'text-error',
    text: 'text-error',
  },
  warning: {
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    icon: 'text-warning',
    text: 'text-warning',
  },
  info: {
    bg: 'bg-accent-blue/10',
    border: 'border-accent-blue/30',
    icon: 'text-accent-blue',
    text: 'text-accent-blue',
  },
}

function getIcon(type: ToastType) {
  return iconMap[type]
}

function getColors(type: ToastType) {
  return colorMap[type]
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
        move-class="transition-all duration-200"
      >
        <div
          v-for="toast in store.activeToasts"
          :key="toast.id"
          :class="[
            'pointer-events-auto w-80 rounded-lg border shadow-lg backdrop-blur-sm',
            getColors(toast.type).bg,
            getColors(toast.type).border,
          ]"
          role="alert"
        >
          <div class="flex items-start gap-3 p-4">
            <!-- Icon -->
            <component
              :is="getIcon(toast.type)"
              :class="['w-5 h-5 flex-shrink-0 mt-0.5', getColors(toast.type).icon]"
            />

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <p :class="['text-sm font-medium', getColors(toast.type).text]">
                {{ toast.title }}
              </p>
              <p v-if="toast.message" class="text-sm text-text-secondary mt-1">
                {{ toast.message }}
              </p>
            </div>

            <!-- Dismiss button -->
            <button
              v-if="toast.dismissible"
              type="button"
              class="flex-shrink-0 p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-white/10 transition-colors"
              @click="store.dismiss(toast.id)"
            >
              <X class="w-4 h-4" />
              <span class="sr-only">Dismiss</span>
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
