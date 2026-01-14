<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  BarChart3,
  RefreshCw,
  ArrowUpRight,
  Zap,
  Filter,
  Calendar,
  User,
  Database,
  Loader2,
  TrendingUp,
  Download,
  Upload,
} from 'lucide-vue-next'
const { t } = useI18n()
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js'
import { Bar, Doughnut } from 'vue-chartjs'
import { useConnectionStore } from '~/stores/connection'
import { useRgwAdmin, type RgwUsageResponse, type UsageFilter } from '~/composables/useRgwAdmin'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
)

const router = useRouter()
const store = useConnectionStore()
const admin = useRgwAdmin()

// =============================================================================
// STATE
// =============================================================================

const loading = ref(true)
const loadingBuckets = ref(false)
const error = ref<string | null>(null)
const usageData = ref<RgwUsageResponse | null>(null)

// Filters
const selectedUser = ref<string>('')
const selectedBucket = ref<string>('')
const timeRange = ref<'today' | '7d' | '30d' | 'all'>('all')

// Available filter options
const availableUsers = ref<string[]>([])
const availableBuckets = ref<string[]>([])

// =============================================================================
// COMPUTED
// =============================================================================

const caps = computed(() => store.capabilities)
const hasUsageCap = computed(() => caps.value.usage)

// Build filter from selections
const currentFilter = computed<UsageFilter>(() => {
  const filter: UsageFilter = {}

  if (selectedUser.value) {
    filter.uid = selectedUser.value
  }
  if (selectedBucket.value) {
    filter.bucket = selectedBucket.value
  }

  // Time range
  const now = new Date()
  if (timeRange.value === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    filter.start = start
  } else if (timeRange.value === '7d') {
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    filter.start = start
  } else if (timeRange.value === '30d') {
    const start = new Date(now)
    start.setDate(start.getDate() - 30)
    filter.start = start
  }

  return filter
})

// Aggregated stats from summary
const totals = computed(() => {
  if (!usageData.value?.summary) {
    return {
      bytesReceived: 0,
      bytesSent: 0,
      totalOps: 0,
      successfulOps: 0,
    }
  }

  return usageData.value.summary.reduce(
    (acc, s) => ({
      bytesReceived: acc.bytesReceived + s.total.bytesReceived,
      bytesSent: acc.bytesSent + s.total.bytesSent,
      totalOps: acc.totalOps + s.total.ops,
      successfulOps: acc.successfulOps + s.total.successfulOps,
    }),
    { bytesReceived: 0, bytesSent: 0, totalOps: 0, successfulOps: 0 }
  )
})

// Operations by category
const operationsByCategory = computed(() => {
  if (!usageData.value?.summary) return new Map<string, number>()

  const ops = new Map<string, number>()

  for (const summary of usageData.value.summary) {
    for (const cat of summary.categories) {
      const current = ops.get(cat.category) || 0
      ops.set(cat.category, current + cat.ops)
    }
  }

  return ops
})

// Bandwidth by user (for chart)
const bandwidthByUser = computed(() => {
  if (!usageData.value?.summary) return { labels: [], received: [], sent: [] }

  const sortedUsers = [...usageData.value.summary]
    .sort((a, b) => (b.total.bytesReceived + b.total.bytesSent) - (a.total.bytesReceived + a.total.bytesSent))
    .slice(0, 10)

  return {
    labels: sortedUsers.map(s => s.user),
    received: sortedUsers.map(s => s.total.bytesReceived),
    sent: sortedUsers.map(s => s.total.bytesSent),
  }
})

// Chart data for bandwidth
const bandwidthChartData = computed(() => ({
  labels: bandwidthByUser.value.labels,
  datasets: [
    {
      label: t('analytics.charts.received'),
      data: bandwidthByUser.value.received,
      backgroundColor: 'rgba(38, 166, 154, 0.7)',
      borderColor: 'rgba(38, 166, 154, 1)',
      borderWidth: 1,
    },
    {
      label: t('analytics.charts.sent'),
      data: bandwidthByUser.value.sent,
      backgroundColor: 'rgba(239, 83, 80, 0.7)',
      borderColor: 'rgba(239, 83, 80, 1)',
      borderWidth: 1,
    },
  ],
}))

const bandwidthChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: {
        color: 'rgba(232, 232, 237, 0.7)',
        font: { family: 'Geist, system-ui, sans-serif', size: 12 },
      },
    },
    tooltip: {
      callbacks: {
        label: (context: { dataset: { label?: string }; raw: unknown }) => {
          const value = context.raw as number
          return `${context.dataset.label}: ${formatSize(value)}`
        },
      },
    },
  },
  scales: {
    x: {
      ticks: { color: 'rgba(136, 136, 160, 1)' },
      grid: { color: 'rgba(255, 255, 255, 0.06)' },
    },
    y: {
      ticks: {
        color: 'rgba(136, 136, 160, 1)',
        callback: (value: string | number) => formatSize(Number(value)),
      },
      grid: { color: 'rgba(255, 255, 255, 0.06)' },
    },
  },
}))

// Chart data for operations breakdown
const operationsChartData = computed(() => {
  const ops = operationsByCategory.value
  const categories = Array.from(ops.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const colors = [
    'rgba(239, 83, 80, 0.8)',   // red
    'rgba(249, 168, 37, 0.8)',  // amber
    'rgba(38, 166, 154, 0.8)',  // teal
    'rgba(66, 165, 245, 0.8)',  // blue
    'rgba(156, 39, 176, 0.8)',  // purple
    'rgba(255, 152, 0, 0.8)',   // orange
    'rgba(76, 175, 80, 0.8)',   // green
    'rgba(158, 158, 158, 0.8)', // gray
  ]

  return {
    labels: categories.map(([name]) => formatCategoryName(name)),
    datasets: [
      {
        data: categories.map(([, count]) => count),
        backgroundColor: colors.slice(0, categories.length),
        borderWidth: 0,
      },
    ],
  }
})

const operationsChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: 'rgba(232, 232, 237, 0.7)',
        font: { family: 'Geist, system-ui, sans-serif', size: 11 },
        padding: 12,
      },
    },
    tooltip: {
      callbacks: {
        label: (context: { label?: string; raw: unknown }) => {
          const value = context.raw as number
          return `${context.label}: ${formatNumber(value)} ops`
        },
      },
    },
  },
}))

// =============================================================================
// LIFECYCLE
// =============================================================================

onMounted(async () => {
  if (!store.connected) {
    router.replace('/connect')
    return
  }

  if (!hasUsageCap.value) {
    // Wait for capability probing
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // Load usage data and bucket list in parallel
  await Promise.all([
    loadUsage(),
    loadBuckets(),
  ])
})

// Reload when filters change
watch([selectedUser, selectedBucket, timeRange], () => {
  loadUsage()
})

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadUsage() {
  loading.value = true
  error.value = null

  const result = await admin.getUsage(currentFilter.value)

  if (result.success && result.data) {
    usageData.value = result.data

    // Extract available users from usage data
    const users = new Set<string>()
    for (const entry of result.data.entries) {
      users.add(entry.user)
    }
    availableUsers.value = Array.from(users).sort()
  } else {
    error.value = result.error ?? 'Failed to load usage data'
  }

  loading.value = false
}

async function loadBuckets() {
  loadingBuckets.value = true

  // Try admin API first (gets all buckets cluster-wide)
  const result = await admin.listAllBuckets()

  if (result.success && result.data) {
    availableBuckets.value = result.data.sort()
  }

  loadingBuckets.value = false
}

// =============================================================================
// HELPERS
// =============================================================================

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i === 0) return `${bytes} B`
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString()
}

function formatCategoryName(category: string): string {
  // Try to get translated name, fallback to formatted category
  const translationKey = `analytics.operations.${category}`
  const translated = t(translationKey)
  // If translation returns the key itself, it means no translation exists
  if (translated === translationKey) {
    return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
  return translated
}

function clearFilters() {
  selectedUser.value = ''
  selectedBucket.value = ''
  timeRange.value = 'all'
}
</script>

<template>
  <LayoutAppLayout :title="$t('analytics.title')" show-endpoint>
    <template #actions>
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="loading"
        @click="loadUsage"
      >
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        {{ $t('common.actions.refresh') }}
      </UiButton>
    </template>

    <!-- No capability state -->
    <div
      v-if="!hasUsageCap && !caps.probing"
      class="flex items-center justify-center min-h-[calc(100vh-12rem)]"
    >
      <CommonEmptyState
        :icon="BarChart3"
        :title="$t('analytics.unavailable.title')"
        :description="$t('analytics.unavailable.description')"
      />
    </div>

    <!-- Main content -->
    <div v-else class="space-y-6">
      <!-- Filters -->
      <section class="bg-bg-secondary border border-border-subtle rounded-xl p-5">
        <div class="flex flex-wrap items-center gap-6">
          <div class="flex items-center gap-2 text-text-secondary">
            <Filter class="w-4 h-4" />
            <span class="text-sm font-medium">{{ $t('analytics.filters.title') }}</span>
          </div>

          <div class="h-6 w-px bg-border-subtle" />

          <!-- Time range -->
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 text-sm text-text-tertiary">
              <Calendar class="w-4 h-4" />
              <span>{{ $t('analytics.filters.period.label') }}</span>
            </label>
            <select
              v-model="timeRange"
              class="h-10 px-4 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 cursor-pointer hover:border-border-default transition-colors"
            >
              <option value="all">{{ $t('analytics.filters.period.all_time') }}</option>
              <option value="today">{{ $t('analytics.filters.period.today') }}</option>
              <option value="7d">{{ $t('analytics.filters.period.last_7_days') }}</option>
              <option value="30d">{{ $t('analytics.filters.period.last_30_days') }}</option>
            </select>
          </div>

          <!-- User filter -->
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 text-sm text-text-tertiary">
              <User class="w-4 h-4" />
              <span>{{ $t('analytics.filters.user.label') }}</span>
            </label>
            <select
              v-model="selectedUser"
              class="h-10 px-4 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 min-w-40 cursor-pointer hover:border-border-default transition-colors"
            >
              <option value="">{{ $t('analytics.filters.user.all_users') }}</option>
              <option v-for="user in availableUsers" :key="user" :value="user">
                {{ user }}
              </option>
            </select>
          </div>

          <!-- Bucket filter -->
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 text-sm text-text-tertiary">
              <Database class="w-4 h-4" />
              <span>{{ $t('analytics.filters.bucket.label') }}</span>
            </label>
            <select
              v-model="selectedBucket"
              class="h-10 px-4 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 min-w-40 cursor-pointer hover:border-border-default transition-colors"
            >
              <option value="">{{ $t('analytics.filters.bucket.all_buckets') }}</option>
              <option v-for="bucket in availableBuckets" :key="bucket" :value="bucket">
                {{ bucket }}
              </option>
            </select>
          </div>

          <!-- Spacer -->
          <div class="flex-1" />

          <!-- Clear filters -->
          <UiButton
            v-if="selectedUser || selectedBucket || timeRange !== 'all'"
            variant="ghost"
            size="sm"
            @click="clearFilters"
          >
            {{ $t('common.actions.clear_filters') }}
          </UiButton>
        </div>
      </section>

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-16">
        <Loader2 class="w-8 h-8 text-accent-primary animate-spin" />
      </div>

      <!-- Error state -->
      <div
        v-else-if="error"
        class="bg-error/10 border border-error/20 rounded-xl p-6 text-center"
      >
        <p class="text-error mb-4">{{ error }}</p>
        <UiButton variant="secondary" @click="loadUsage">
          {{ $t('common.actions.try_again') }}
        </UiButton>
      </div>

      <!-- Data -->
      <template v-else-if="usageData">
        <!-- Summary cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Bytes Received -->
          <div class="bg-bg-secondary border border-border-subtle rounded-xl p-5">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-lg bg-accent-tertiary/20 flex items-center justify-center">
                <Download class="w-5 h-5 text-accent-tertiary" />
              </div>
              <div>
                <p class="text-2xl font-semibold text-text-primary font-mono">
                  {{ formatSize(totals.bytesReceived) }}
                </p>
                <p class="text-xs text-text-secondary">{{ $t('analytics.summary.bytes_received') }}</p>
              </div>
            </div>
          </div>

          <!-- Bytes Sent -->
          <div class="bg-bg-secondary border border-border-subtle rounded-xl p-5">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-lg bg-accent-primary/20 flex items-center justify-center">
                <Upload class="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <p class="text-2xl font-semibold text-text-primary font-mono">
                  {{ formatSize(totals.bytesSent) }}
                </p>
                <p class="text-xs text-text-secondary">{{ $t('analytics.summary.bytes_sent') }}</p>
              </div>
            </div>
          </div>

          <!-- Total Operations -->
          <div class="bg-bg-secondary border border-border-subtle rounded-xl p-5">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-lg bg-accent-secondary/20 flex items-center justify-center">
                <Zap class="w-5 h-5 text-accent-secondary" />
              </div>
              <div>
                <p class="text-2xl font-semibold text-text-primary font-mono">
                  {{ formatNumber(totals.totalOps) }}
                </p>
                <p class="text-xs text-text-secondary">{{ $t('analytics.summary.total_operations') }}</p>
              </div>
            </div>
          </div>

          <!-- Success Rate -->
          <div class="bg-bg-secondary border border-border-subtle rounded-xl p-5">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-lg bg-accent-blue/20 flex items-center justify-center">
                <TrendingUp class="w-5 h-5 text-accent-blue" />
              </div>
              <div>
                <p class="text-2xl font-semibold text-text-primary font-mono">
                  {{ totals.totalOps > 0 ? ((totals.successfulOps / totals.totalOps) * 100).toFixed(1) : 0 }}%
                </p>
                <p class="text-xs text-text-secondary">{{ $t('analytics.summary.success_rate') }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Charts row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Bandwidth by user -->
          <section class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
            <div class="flex items-center gap-2 mb-6">
              <ArrowUpRight class="w-5 h-5 text-accent-primary" />
              <h3 class="font-medium text-text-primary">{{ $t('analytics.charts.bandwidth_by_user') }}</h3>
            </div>

            <div v-if="bandwidthByUser.labels.length > 0" class="h-80">
              <Bar :data="bandwidthChartData" :options="bandwidthChartOptions" />
            </div>
            <div v-else class="h-80 flex items-center justify-center text-text-tertiary">
              {{ $t('analytics.charts.no_bandwidth_data') }}
            </div>
          </section>

          <!-- Operations breakdown -->
          <section class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
            <div class="flex items-center gap-2 mb-6">
              <BarChart3 class="w-5 h-5 text-accent-secondary" />
              <h3 class="font-medium text-text-primary">{{ $t('analytics.charts.operations_breakdown') }}</h3>
            </div>

            <div v-if="operationsByCategory.size > 0" class="h-80">
              <Doughnut :data="operationsChartData" :options="operationsChartOptions" />
            </div>
            <div v-else class="h-80 flex items-center justify-center text-text-tertiary">
              {{ $t('analytics.charts.no_operations_data') }}
            </div>
          </section>
        </div>

        <!-- Detailed user breakdown table -->
        <section class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
          <div class="flex items-center gap-2 mb-6">
            <User class="w-5 h-5 text-accent-blue" />
            <h3 class="font-medium text-text-primary">{{ $t('analytics.usage_by_user.title') }}</h3>
          </div>

          <div v-if="usageData.summary.length > 0" class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="text-left text-xs text-text-tertiary uppercase tracking-wider border-b border-border-subtle">
                  <th class="pb-3 pr-4">{{ $t('analytics.usage_by_user.table.user') }}</th>
                  <th class="pb-3 pr-4 text-right">{{ $t('analytics.usage_by_user.table.received') }}</th>
                  <th class="pb-3 pr-4 text-right">{{ $t('analytics.usage_by_user.table.sent') }}</th>
                  <th class="pb-3 pr-4 text-right">{{ $t('analytics.usage_by_user.table.operations') }}</th>
                  <th class="pb-3 text-right">{{ $t('analytics.usage_by_user.table.success_rate') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle">
                <tr
                  v-for="summary in usageData.summary"
                  :key="summary.user"
                  class="hover:bg-bg-hover/50 transition-colors"
                >
                  <td class="py-3 pr-4">
                    <span class="font-mono text-sm text-text-primary">{{ summary.user }}</span>
                  </td>
                  <td class="py-3 pr-4 text-right">
                    <span class="font-mono text-sm text-accent-tertiary">
                      {{ formatSize(summary.total.bytesReceived) }}
                    </span>
                  </td>
                  <td class="py-3 pr-4 text-right">
                    <span class="font-mono text-sm text-accent-primary">
                      {{ formatSize(summary.total.bytesSent) }}
                    </span>
                  </td>
                  <td class="py-3 pr-4 text-right">
                    <span class="font-mono text-sm text-text-primary">
                      {{ formatNumber(summary.total.ops) }}
                    </span>
                  </td>
                  <td class="py-3 text-right">
                    <span class="font-mono text-sm text-text-secondary">
                      {{ summary.total.ops > 0 ? ((summary.total.successfulOps / summary.total.ops) * 100).toFixed(1) : 0 }}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="py-8 text-center text-text-tertiary">
            {{ $t('analytics.usage_by_user.empty') }}
          </div>
        </section>
      </template>
    </div>
  </LayoutAppLayout>
</template>
