<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

interface Props {
  open: boolean
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  showClose?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  closeOnBackdrop: true,
  closeOnEscape: true,
  showClose: true,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
}>()

const modalRef = ref<HTMLElement | null>(null)
const previousActiveElement = ref<HTMLElement | null>(null)

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}

function close() {
  emit('update:open', false)
  emit('close')
}

function handleBackdropClick(event: MouseEvent) {
  if (props.closeOnBackdrop && event.target === event.currentTarget) {
    close()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (props.closeOnEscape && event.key === 'Escape') {
    close()
  }

  // Focus trap
  if (event.key === 'Tab' && modalRef.value) {
    const focusableElements = modalRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement?.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement?.focus()
    }
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    previousActiveElement.value = document.activeElement as HTMLElement
    document.body.style.overflow = 'hidden'
    // Focus first focusable element after render
    setTimeout(() => {
      const focusable = modalRef.value?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      focusable?.focus()
    }, 0)
  } else {
    document.body.style.overflow = ''
    previousActiveElement.value?.focus()
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click="handleBackdropClick"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <!-- Modal -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 scale-95 translate-y-2"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-95 translate-y-2"
        >
          <div
            v-if="open"
            ref="modalRef"
            :class="[
              'relative w-full bg-bg-tertiary border border-border-subtle rounded-xl shadow-xl flex flex-col max-h-[calc(100vh-2rem)]',
              sizeClasses[size]
            ]"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="title ? 'modal-title' : undefined"
            :aria-describedby="description ? 'modal-description' : undefined"
          >
            <!-- Header -->
            <div
              v-if="title || showClose"
              class="flex items-start justify-between gap-4 p-4 border-b border-border-subtle flex-shrink-0"
            >
              <div v-if="title || description" class="flex-1 min-w-0">
                <h2
                  v-if="title"
                  id="modal-title"
                  class="text-lg font-semibold text-text-primary"
                >
                  {{ title }}
                </h2>
                <p
                  v-if="description"
                  id="modal-description"
                  class="text-sm text-text-secondary mt-1"
                >
                  {{ description }}
                </p>
              </div>

              <button
                v-if="showClose"
                type="button"
                class="flex-shrink-0 p-1.5 -m-1.5 text-text-tertiary hover:text-text-secondary transition-colors rounded-lg hover:bg-bg-hover"
                @click="close"
              >
                <X class="w-5 h-5" />
              </button>
            </div>

            <!-- Body -->
            <div class="p-4 overflow-y-auto flex-1 min-h-0">
              <slot />
            </div>

            <!-- Footer -->
            <div
              v-if="$slots['footer']"
              class="flex items-center justify-end gap-3 p-4 border-t border-border-subtle flex-shrink-0"
            >
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
