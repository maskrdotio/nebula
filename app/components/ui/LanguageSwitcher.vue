<script setup lang="ts">
import { computed, ref } from 'vue'
import { Globe, ChevronDown, Check } from 'lucide-vue-next'

const { locale, locales, setLocale } = useI18n()

const isOpen = ref(false)

const currentLocale = computed(() => {
  const current = locales.value.find(l =>
    typeof l === 'string' ? l === locale.value : l.code === locale.value
  )
  return typeof current === 'string' ? current : current?.name || locale.value
})

const availableLocales = computed(() => {
  return locales.value.map(l => ({
    code: typeof l === 'string' ? l : l.code,
    name: typeof l === 'string' ? l : l.name || l.code,
  }))
})

function selectLocale(code: string) {
  setLocale(code as 'en')
  isOpen.value = false
}

// Close on escape
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    isOpen.value = false
  }
}
</script>

<template>
  <div
    class="language-switcher relative"
    @keydown="handleKeyDown"
  >
    <button
      type="button"
      class="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
      @click="isOpen = !isOpen"
    >
      <Globe class="w-4 h-4" />
      <span>{{ currentLocale }}</span>
      <ChevronDown
        class="w-3 h-3 transition-transform"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-1"
    >
      <div
        v-if="isOpen"
        class="absolute bottom-full left-0 mb-1 min-w-[140px] py-1 bg-bg-secondary border border-border-subtle rounded-lg shadow-xl z-50"
      >
        <button
          v-for="loc in availableLocales"
          :key="loc.code"
          type="button"
          class="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          @click="selectLocale(loc.code)"
        >
          <span>{{ loc.name }}</span>
          <Check
            v-if="loc.code === locale"
            class="w-4 h-4 text-accent-primary"
          />
        </button>
      </div>
    </Transition>

    <!-- Backdrop to close on click outside -->
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40"
      @click="isOpen = false"
    />
  </div>
</template>
