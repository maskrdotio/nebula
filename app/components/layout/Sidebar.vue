<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  LayoutDashboard,
  Database,
  Users,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Orbit,
  Activity,
} from 'lucide-vue-next'
import { useConnectionStore } from '~/stores/connection'

const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
}>()

const { t } = useI18n()
const route = useRoute()
const store = useConnectionStore()

// Health check interval
let healthCheckInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // Initial health check
  if (store.connected) {
    store.checkHealth()
  }

  // Periodic health check every 30 seconds
  healthCheckInterval = setInterval(() => {
    if (store.connected) {
      store.checkHealth()
    }
  }, 30000)
})

onUnmounted(() => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
  }
})

// Health status display
const healthStatus = computed(() => store.health.status)
const healthColor = computed(() => {
  switch (healthStatus.value) {
    case 'healthy': return 'bg-success'
    case 'degraded': return 'bg-warning'
    case 'unhealthy': return 'bg-error'
    default: return 'bg-text-tertiary'
  }
})
const healthLabel = computed(() => {
  switch (healthStatus.value) {
    case 'healthy': return t('common.status.healthy')
    case 'degraded': return t('common.status.degraded')
    case 'unhealthy': return t('common.status.unhealthy')
    default: return t('common.status.unknown')
  }
})
const responseTimeLabel = computed(() => {
  const ms = store.health.lastResponseTime
  if (ms === null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
})

const isCollapsed = computed({
  get: () => props.collapsed,
  set: (value) => emit('update:collapsed', value),
})

interface NavItem {
  nameKey: string
  path: string
  icon: typeof LayoutDashboard
  requiresCap?: keyof typeof store.capabilities
  requiresAdminApi?: boolean  // Requires Ceph RGW with admin API
  disabled?: boolean
  disabledLabel?: string
}

const navItems = computed<NavItem[]>(() => [
  {
    nameKey: 'nav.dashboard',
    path: '/',
    icon: LayoutDashboard,
  },
  {
    nameKey: 'nav.buckets',
    path: '/buckets',
    icon: Database,
  },
  {
    nameKey: 'nav.users',
    path: '/users',
    icon: Users,
    requiresCap: 'users',
    requiresAdminApi: true,
  },
  {
    nameKey: 'nav.analytics',
    path: '/analytics',
    icon: BarChart3,
    requiresCap: 'usage',
    requiresAdminApi: true,
  },
])

const visibleNavItems = computed(() => {
  return navItems.value.filter(item => {
    // Check if item requires admin API (Ceph RGW specific)
    if (item.requiresAdminApi && !store.hasAdminApi) {
      return false
    }
    // Check capability requirement
    if (item.requiresCap) {
      return store.capabilities[item.requiresCap]
    }
    return true
  })
})

function isActive(path: string): boolean {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(path)
}
</script>

<template>
  <aside
    :class="[
      'fixed left-0 top-0 h-screen bg-bg-secondary border-r border-border-subtle flex flex-col z-50 transition-all duration-200',
      isCollapsed ? 'w-16' : 'w-60'
    ]"
  >
    <!-- Logo -->
    <div class="h-16 flex items-center px-4 border-b border-border-subtle">
      <div class="flex items-center gap-3 overflow-hidden">
        <div class="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center flex-shrink-0">
          <Orbit class="w-5 h-5 text-accent-primary" />
        </div>
        <span
          v-if="!isCollapsed"
          class="text-lg font-semibold text-text-primary whitespace-nowrap"
        >
          {{ $t('app.name') }}
        </span>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
      <template v-for="item in visibleNavItems" :key="item.path">
        <NuxtLink
          v-if="!item.disabled"
          :to="item.path"
          :class="[
            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group',
            isActive(item.path)
              ? 'bg-accent-primary/10 text-accent-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
          ]"
        >
          <component
            :is="item.icon"
            :class="[
              'w-5 h-5 flex-shrink-0',
              isActive(item.path) ? 'text-accent-primary' : 'text-text-tertiary group-hover:text-text-secondary'
            ]"
          />
          <span
            v-if="!isCollapsed"
            class="text-sm font-medium whitespace-nowrap"
          >
            {{ $t(item.nameKey) }}
          </span>
        </NuxtLink>

        <!-- Disabled item -->
        <div
          v-else
          :class="[
            'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-not-allowed opacity-50',
            'text-text-tertiary'
          ]"
          :title="item.disabledLabel"
        >
          <component
            :is="item.icon"
            class="w-5 h-5 flex-shrink-0 text-text-tertiary"
          />
          <div v-if="!isCollapsed" class="flex flex-col">
            <span class="text-sm font-medium whitespace-nowrap">{{ $t(item.nameKey) }}</span>
            <span v-if="item.disabledLabel" class="text-xs text-text-tertiary">{{ item.disabledLabel }}</span>
          </div>
        </div>
      </template>
    </nav>

    <!-- Bottom section -->
    <div class="px-2 pb-4 space-y-1">
      <!-- Health indicator -->
      <div
        v-if="store.connected"
        class="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-primary/50"
        :title="`Status: ${healthLabel}${responseTimeLabel ? ` (${responseTimeLabel})` : ''}${store.cephVersion ? `\nCeph ${store.cephVersion}` : ''}`"
      >
        <div class="relative flex-shrink-0">
          <Activity class="w-4 h-4 text-text-tertiary" />
          <span
            :class="[
              'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-bg-secondary',
              healthColor,
              healthStatus === 'healthy' ? 'animate-pulse' : ''
            ]"
          />
        </div>
        <div v-if="!isCollapsed" class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <span class="text-xs text-text-secondary">{{ healthLabel }}</span>
            <span v-if="responseTimeLabel" class="text-xs font-mono text-text-tertiary">
              {{ responseTimeLabel }}
            </span>
          </div>
          <div v-if="store.cephVersion" class="text-[10px] text-text-tertiary mt-0.5">
            {{ $t('health.ceph_version', { version: store.cephVersion }) }}
          </div>
        </div>
      </div>

      <!-- Settings/Connection -->
      <NuxtLink
        to="/connect"
        :class="[
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group',
          isActive('/connect')
            ? 'bg-accent-primary/10 text-accent-primary'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
        ]"
      >
        <Settings
          :class="[
            'w-5 h-5 flex-shrink-0',
            isActive('/connect') ? 'text-accent-primary' : 'text-text-tertiary group-hover:text-text-secondary'
          ]"
        />
        <span
          v-if="!isCollapsed"
          class="text-sm font-medium whitespace-nowrap"
        >
          {{ $t('nav.connection') }}
        </span>
      </NuxtLink>

      <!-- Language Switcher -->
      <div v-if="!isCollapsed" class="px-1">
        <UiLanguageSwitcher />
      </div>

      <!-- Collapse toggle -->
      <button
        type="button"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-all"
        @click="isCollapsed = !isCollapsed"
      >
        <component
          :is="isCollapsed ? ChevronRight : ChevronLeft"
          class="w-5 h-5 flex-shrink-0"
        />
        <span
          v-if="!isCollapsed"
          class="text-sm font-medium whitespace-nowrap"
        >
          {{ $t('nav.collapse') }}
        </span>
      </button>
    </div>
  </aside>
</template>
