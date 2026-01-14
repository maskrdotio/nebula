import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration: number
  dismissible: boolean
  createdAt: number
}

export interface ToastOptions {
  title: string
  message?: string
  duration?: number
  dismissible?: boolean
}

const DEFAULT_DURATION = 5000

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])

  /** Reactive list of currently visible toasts */
  const activeToasts = computed(() => toasts.value)

  /**
   * Creates a unique identifier for toast tracking.
   * @return { string } Unique toast ID
   */
  function generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Creates and displays a toast notification with auto-dismiss timer.
   * @param { ToastType } type - Visual style (success, error, warning, info)
   * @param { ToastOptions } options - Toast content and behavior settings
   * @return { string } Toast ID for programmatic dismissal
   */
  function addToast(type: ToastType, options: ToastOptions): string {
    const id = generateId()
    const toast: Toast = {
      id,
      type,
      title: options.title,
      message: options.message,
      duration: options.duration ?? DEFAULT_DURATION,
      dismissible: options.dismissible ?? true,
      createdAt: Date.now(),
    }

    toasts.value.push(toast)

    // Auto-dismiss after duration
    if (toast.duration > 0) {
      setTimeout(() => {
        dismiss(id)
      }, toast.duration)
    }

    return id
  }

  /**
   * Removes a specific toast from the screen.
   * @param { string } id - Toast ID to dismiss
   */
  function dismiss(id: string) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  /**
   * Clears all visible toasts immediately.
   */
  function dismissAll() {
    toasts.value = []
  }

  /**
   * Shows a success toast with green styling.
   * @param { ToastOptions | string } options - Toast options or just a title string
   * @return { string } Toast ID
   */
  function success(options: ToastOptions | string) {
    const opts = typeof options === 'string' ? { title: options } : options
    return addToast('success', opts)
  }

  /**
   * Shows an error toast with red styling and extended duration (8s default).
   * @param { ToastOptions | string } options - Toast options or just a title string
   * @return { string } Toast ID
   */
  function error(options: ToastOptions | string) {
    const opts = typeof options === 'string' ? { title: options } : options
    // Errors stay longer by default
    if (typeof options !== 'string' && options.duration === undefined) {
      opts.duration = 8000
    }
    return addToast('error', opts)
  }

  /**
   * Shows a warning toast with amber styling.
   * @param { ToastOptions | string } options - Toast options or just a title string
   * @return { string } Toast ID
   */
  function warning(options: ToastOptions | string) {
    const opts = typeof options === 'string' ? { title: options } : options
    return addToast('warning', opts)
  }

  /**
   * Shows an info toast with blue styling.
   * @param { ToastOptions | string } options - Toast options or just a title string
   * @return { string } Toast ID
   */
  function info(options: ToastOptions | string) {
    const opts = typeof options === 'string' ? { title: options } : options
    return addToast('info', opts)
  }

  return {
    toasts,
    activeToasts,
    addToast,
    dismiss,
    dismissAll,
    success,
    error,
    warning,
    info,
  }
})

/**
 * Simplified composable for showing toast notifications.
 * Exposes only the methods needed for typical usage without store internals.
 * @return { object } Toast methods (success, error, warning, info, dismiss, dismissAll)
 */
export function useToast() {
  const store = useToastStore()

  return {
    success: store.success,
    error: store.error,
    warning: store.warning,
    info: store.info,
    dismiss: store.dismiss,
    dismissAll: store.dismissAll,
  }
}
