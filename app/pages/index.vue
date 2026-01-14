<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Database,
  Users,
  Activity,
  HardDrive,
  ArrowUpRight,
  ArrowDownLeft,
  Zap,
  RefreshCw,
  FolderOpen,
  Shield,
  Loader2,
  Globe,
  Network,
  CheckCircle2,
} from 'lucide-vue-next'
import { useConnectionStore } from '~/stores/connection'
import { useS3Client } from '~/composables/useS3Client'
import { useRgwAdmin, type ClusterStats, type UserStats, type UsageStats, type ZoneInfo } from '~/composables/useRgwAdmin'

const router = useRouter()
const store = useConnectionStore()
const s3 = useS3Client()
const admin = useRgwAdmin()

// =============================================================================
// STATE
// =============================================================================

// My buckets (basic S3)
const myBuckets = ref<Array<{ name: string; creationDate?: Date }>>([])
const myBucketsLoading = ref(true)
const myBucketsError = ref<string | null>(null)

// Cluster stats (bucket admin cap)
const clusterStats = ref<ClusterStats | null>(null)
const clusterStatsLoading = ref(false)
const clusterStatsError = ref<string | null>(null)

// User stats (user admin cap)
const userStats = ref<UserStats | null>(null)
const userStatsLoading = ref(false)
const userStatsError = ref<string | null>(null)

// Usage stats (usage cap)
const usageStats = ref<UsageStats | null>(null)
const usageStatsLoading = ref(false)
const usageStatsError = ref<string | null>(null)

// Zone info (zone cap)
const zoneInfo = ref<ZoneInfo | null>(null)
const zoneInfoLoading = ref(false)
const zoneInfoError = ref<string | null>(null)

// =============================================================================
// COMPUTED
// =============================================================================

const caps = computed(() => store.capabilities)
const isProbing = computed(() => caps.value.probing)
const isDetectingBackend = computed(() => store.detectingBackend)
const hasAdminApi = computed(() => store.hasAdminApi)

// Recent buckets (last 5 by creation date)
const recentBuckets = computed(() => {
  return [...myBuckets.value]
    .filter(b => b.creationDate)
    .sort((a, b) => (b.creationDate?.getTime() ?? 0) - (a.creationDate?.getTime() ?? 0))
    .slice(0, 5)
})

// =============================================================================
// LIFECYCLE
// =============================================================================

onMounted(async () => {
  // Redirect to connect if not connected
  if (!store.connected) {
    router.replace('/connect')
    return
  }

  // Load my buckets
  await loadMyBuckets()
})

// Watch for capability changes and load admin data
watch(
  () => caps.value,
  async (newCaps) => {
    if (newCaps.probing) return

    // Load admin stats based on capabilities
    if (newCaps.buckets && !clusterStats.value && !clusterStatsLoading.value) {
      loadClusterStats()
    }
    if (newCaps.users && !userStats.value && !userStatsLoading.value) {
      loadUserStats()
    }
    if (newCaps.usage && !usageStats.value && !usageStatsLoading.value) {
      loadUsageStats()
    }
    if (newCaps.zone && !zoneInfo.value && !zoneInfoLoading.value) {
      loadZoneInfo()
    }
  },
  { immediate: true }
)

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadMyBuckets() {
  myBucketsLoading.value = true
  myBucketsError.value = null

  const result = await s3.listBuckets()

  if (result.success && result.data) {
    myBuckets.value = result.data.map(b => ({
      name: b.name,
      creationDate: b.creationDate,
    }))
  } else {
    myBucketsError.value = result.error ?? 'Failed to load buckets'
  }

  myBucketsLoading.value = false
}

async function loadClusterStats() {
  clusterStatsLoading.value = true
  clusterStatsError.value = null

  const result = await admin.getClusterStats()

  if (result.success && result.data) {
    clusterStats.value = result.data
  } else {
    clusterStatsError.value = result.error ?? 'Failed to load cluster stats'
  }

  clusterStatsLoading.value = false
}

async function loadUserStats() {
  userStatsLoading.value = true
  userStatsError.value = null

  const result = await admin.getUserStats(5)

  if (result.success && result.data) {
    userStats.value = result.data
  } else {
    userStatsError.value = result.error ?? 'Failed to load user stats'
  }

  userStatsLoading.value = false
}

async function loadUsageStats() {
  usageStatsLoading.value = true
  usageStatsError.value = null

  const result = await admin.getAggregatedUsage()

  if (result.success && result.data) {
    usageStats.value = result.data
  } else {
    usageStatsError.value = result.error ?? 'Failed to load usage stats'
  }

  usageStatsLoading.value = false
}

async function loadZoneInfo() {
  zoneInfoLoading.value = true
  zoneInfoError.value = null

  const result = await admin.getZoneInfo()

  if (result.success && result.data) {
    zoneInfo.value = result.data
  } else {
    zoneInfoError.value = result.error ?? 'Failed to load zone info'
  }

  zoneInfoLoading.value = false
}

async function refreshAll() {
  await loadMyBuckets()
  if (caps.value.buckets) loadClusterStats()
  if (caps.value.users) loadUserStats()
  if (caps.value.usage) loadUsageStats()
  if (caps.value.zone) loadZoneInfo()
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

function navigateToBucket(bucketName: string) {
  router.push(`/browse/${bucketName}`)
}
</script>

<template>
  <LayoutAppLayout :title="$t('dashboard.title')" show-endpoint>
    <template #actions>
      <!-- Backend type & capability badge -->
      <div
        v-if="!isProbing && !isDetectingBackend"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle"
      >
        <Shield class="w-3.5 h-3.5 text-text-tertiary" />
        <span class="text-xs text-text-secondary">
          {{ $t(`connection.backend.${store.backendType}`) }}
          <template v-if="hasAdminApi && store.hasAnyAdminCap">
            · {{ store.capabilitySummary }}
          </template>
        </span>
      </div>
      <div
        v-else
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle"
      >
        <Loader2 class="w-3.5 h-3.5 text-text-tertiary animate-spin" />
        <span class="text-xs text-text-secondary">{{ $t('dashboard.detecting_capabilities') }}</span>
      </div>

      <!-- Refresh button -->
      <UiButton variant="ghost" size="sm" @click="refreshAll">
        <RefreshCw class="w-4 h-4" />
        {{ $t('common.actions.refresh') }}
      </UiButton>
    </template>

    <div class="space-y-6">
      <!-- My Buckets Section (Always shown) -->
      <section>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-text-primary flex items-center gap-2">
            <Database class="w-5 h-5 text-accent-primary" />
            {{ $t('dashboard.my_buckets.title') }}
          </h2>
          <NuxtLink
            to="/buckets"
            class="text-sm text-accent-primary hover:text-accent-primary/80 transition-colors"
          >
            {{ $t('common.actions.view_all') }}
          </NuxtLink>
        </div>

        <!-- Loading state -->
        <div v-if="myBucketsLoading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            v-for="i in 4"
            :key="i"
            class="bg-bg-secondary border border-border-subtle rounded-xl p-5"
          >
            <UiSkeleton class="w-24 h-4 mb-3" />
            <UiSkeleton class="w-16 h-3" />
          </div>
        </div>

        <!-- Error state -->
        <div
          v-else-if="myBucketsError"
          class="bg-error/10 border border-error/20 rounded-xl p-6 text-center"
        >
          <p class="text-error text-sm">{{ myBucketsError }}</p>
        </div>

        <!-- Empty state -->
        <div
          v-else-if="myBuckets.length === 0"
          class="bg-bg-secondary border border-border-subtle rounded-xl p-8 text-center"
        >
          <FolderOpen class="w-12 h-12 text-text-tertiary mx-auto mb-3" />
          <p class="text-text-secondary">{{ $t('dashboard.my_buckets.empty') }}</p>
          <UiButton
            variant="primary"
            size="sm"
            class="mt-4"
            @click="router.push('/buckets')"
          >
            {{ $t('dashboard.my_buckets.create_button') }}
          </UiButton>
        </div>

        <!-- Buckets grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Summary card -->
          <div class="bg-gradient-to-br from-accent-primary/10 to-accent-primary/5 border border-accent-primary/20 rounded-xl p-5">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-lg bg-accent-primary/20 flex items-center justify-center">
                <Database class="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <p class="text-2xl font-semibold text-text-primary font-mono">{{ myBuckets.length }}</p>
                <p class="text-xs text-text-secondary">{{ $t('dashboard.my_buckets.total_buckets') }}</p>
              </div>
            </div>
          </div>

          <!-- Recent buckets -->
          <template v-for="bucket in recentBuckets.slice(0, 3)" :key="bucket.name">
            <button
              type="button"
              class="bg-bg-secondary border border-border-subtle rounded-xl p-5 text-left hover:border-border-default hover:bg-bg-tertiary transition-all group"
              @click="navigateToBucket(bucket.name)"
            >
              <div class="flex items-center justify-between mb-2">
                <p class="font-mono text-sm text-text-primary truncate">{{ bucket.name }}</p>
                <ArrowUpRight class="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p v-if="bucket.creationDate" class="text-xs text-text-tertiary">
                {{ $t('common.time.created') }} {{ bucket.creationDate.toLocaleDateString() }}
              </p>
            </button>
          </template>
        </div>
      </section>

      <!-- Admin Stats Grid (Ceph RGW with admin API only) -->
      <div
        v-if="hasAdminApi && (caps.buckets || caps.users || caps.usage || caps.zone)"
        class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6"
      >
        <!-- Cluster Stats (bucket admin) -->
        <section v-if="caps.buckets" class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
          <div class="flex items-center gap-2 mb-4">
            <HardDrive class="w-5 h-5 text-accent-tertiary" />
            <h3 class="font-medium text-text-primary">{{ $t('dashboard.cluster_overview.title') }}</h3>
          </div>

          <!-- Loading -->
          <div v-if="clusterStatsLoading" class="space-y-4">
            <div v-for="i in 3" :key="i" class="flex justify-between">
              <UiSkeleton class="w-20 h-4" />
              <UiSkeleton class="w-16 h-4" />
            </div>
          </div>

          <!-- Error -->
          <div v-else-if="clusterStatsError" class="text-error text-sm">
            {{ clusterStatsError }}
          </div>

          <!-- Data -->
          <div v-else-if="clusterStats" class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm text-text-secondary">{{ $t('dashboard.cluster_overview.total_buckets') }}</span>
              <span class="font-mono text-text-primary">{{ formatNumber(clusterStats.totalBuckets) }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-text-secondary">{{ $t('dashboard.cluster_overview.total_objects') }}</span>
              <span class="font-mono text-text-primary">{{ formatNumber(clusterStats.totalObjects) }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-text-secondary">{{ $t('dashboard.cluster_overview.total_size') }}</span>
              <span class="font-mono text-text-primary">{{ formatSize(clusterStats.totalSize) }}</span>
            </div>
            <div class="border-t border-border-subtle pt-4">
              <p class="text-xs text-text-tertiary mb-2">{{ $t('dashboard.cluster_overview.unique_owners') }}</p>
              <p class="font-mono text-lg text-text-primary">{{ clusterStats.bucketsByOwner.size }}</p>
            </div>
          </div>

          <!-- Waiting for probe -->
          <div v-else class="text-text-tertiary text-sm">
            {{ $t('common.status.loading') }}
          </div>
        </section>

        <!-- User Stats (user admin) -->
        <section v-if="caps.users" class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
          <div class="flex items-center gap-2 mb-4">
            <Users class="w-5 h-5 text-accent-secondary" />
            <h3 class="font-medium text-text-primary">{{ $t('dashboard.users.title') }}</h3>
          </div>

          <!-- Loading -->
          <div v-if="userStatsLoading" class="space-y-4">
            <div v-for="i in 3" :key="i" class="flex justify-between">
              <UiSkeleton class="w-24 h-4" />
              <UiSkeleton class="w-16 h-4" />
            </div>
          </div>

          <!-- Error -->
          <div v-else-if="userStatsError" class="text-error text-sm">
            {{ userStatsError }}
          </div>

          <!-- Data -->
          <div v-else-if="userStats" class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm text-text-secondary">{{ $t('dashboard.users.total_users') }}</span>
              <span class="font-mono text-text-primary">{{ formatNumber(userStats.totalUsers) }}</span>
            </div>

            <div v-if="userStats.topUsersBySize.length > 0" class="border-t border-border-subtle pt-4">
              <p class="text-xs text-text-tertiary mb-3">{{ $t('dashboard.users.top_by_storage') }}</p>
              <div class="space-y-2">
                <div
                  v-for="user in userStats.topUsersBySize"
                  :key="user.userId"
                  class="flex justify-between items-center text-sm"
                >
                  <span class="text-text-secondary truncate max-w-32" :title="user.displayName || user.userId">
                    {{ user.displayName || user.userId }}
                  </span>
                  <span class="font-mono text-text-primary">{{ formatSize(user.size) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Waiting -->
          <div v-else class="text-text-tertiary text-sm">
            {{ $t('common.status.loading') }}
          </div>
        </section>

        <!-- Usage Stats (usage cap) -->
        <section v-if="caps.usage" class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
          <div class="flex items-center gap-2 mb-4">
            <Activity class="w-5 h-5 text-accent-blue" />
            <h3 class="font-medium text-text-primary">{{ $t('dashboard.usage.title') }}</h3>
          </div>

          <!-- Loading -->
          <div v-if="usageStatsLoading" class="space-y-4">
            <div v-for="i in 4" :key="i" class="flex justify-between">
              <UiSkeleton class="w-20 h-4" />
              <UiSkeleton class="w-16 h-4" />
            </div>
          </div>

          <!-- Error -->
          <div v-else-if="usageStatsError" class="text-error text-sm">
            {{ usageStatsError }}
          </div>

          <!-- Data -->
          <div v-else-if="usageStats" class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm text-text-secondary flex items-center gap-1.5">
                <ArrowDownLeft class="w-3.5 h-3.5 text-accent-tertiary" />
                {{ $t('dashboard.usage.bytes_received') }}
              </span>
              <span class="font-mono text-text-primary">{{ formatSize(usageStats.bytesReceived) }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-text-secondary flex items-center gap-1.5">
                <ArrowUpRight class="w-3.5 h-3.5 text-accent-primary" />
                {{ $t('dashboard.usage.bytes_sent') }}
              </span>
              <span class="font-mono text-text-primary">{{ formatSize(usageStats.bytesSent) }}</span>
            </div>
            <div class="border-t border-border-subtle pt-4">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm text-text-secondary flex items-center gap-1.5">
                  <Zap class="w-3.5 h-3.5 text-accent-secondary" />
                  {{ $t('dashboard.usage.total_operations') }}
                </span>
                <span class="font-mono text-text-primary">{{ formatNumber(usageStats.totalOps) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-text-secondary">{{ $t('dashboard.usage.successful') }}</span>
                <span class="font-mono text-accent-tertiary">{{ formatNumber(usageStats.successfulOps) }}</span>
              </div>
            </div>
          </div>

          <!-- Waiting -->
          <div v-else class="text-text-tertiary text-sm">
            {{ $t('common.status.loading') }}
          </div>
        </section>

        <!-- Zone Info (zone cap) -->
        <section v-if="caps.zone" class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
          <div class="flex items-center gap-2 mb-4">
            <Globe class="w-5 h-5 text-accent-primary" />
            <h3 class="font-medium text-text-primary">{{ $t('dashboard.zone.title') }}</h3>
          </div>

          <!-- Loading -->
          <div v-if="zoneInfoLoading" class="space-y-4">
            <div v-for="i in 3" :key="i" class="flex justify-between">
              <UiSkeleton class="w-20 h-4" />
              <UiSkeleton class="w-24 h-4" />
            </div>
          </div>

          <!-- Error -->
          <div v-else-if="zoneInfoError" class="text-error text-sm">
            {{ zoneInfoError }}
          </div>

          <!-- Data -->
          <div v-else-if="zoneInfo" class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm text-text-secondary">{{ $t('dashboard.zone.zone_name') }}</span>
              <span class="font-mono text-text-primary">{{ zoneInfo.name }}</span>
            </div>
            <div v-if="zoneInfo.realm" class="flex justify-between items-center">
              <span class="text-sm text-text-secondary">{{ $t('dashboard.zone.realm') }}</span>
              <span class="font-mono text-text-primary">{{ zoneInfo.realm }}</span>
            </div>
            <div class="border-t border-border-subtle pt-4">
              <div class="flex items-center gap-2">
                <template v-if="zoneInfo.isMultiSite">
                  <Network class="w-4 h-4 text-accent-secondary" />
                  <span class="text-sm text-text-secondary">{{ $t('dashboard.zone.multi_site') }}</span>
                </template>
                <template v-else>
                  <CheckCircle2 class="w-4 h-4 text-accent-tertiary" />
                  <span class="text-sm text-text-secondary">{{ $t('dashboard.zone.single_zone') }}</span>
                </template>
              </div>
            </div>
          </div>

          <!-- Waiting -->
          <div v-else class="text-text-tertiary text-sm">
            {{ $t('common.status.loading') }}
          </div>
        </section>
      </div>
    </div>
  </LayoutAppLayout>
</template>
