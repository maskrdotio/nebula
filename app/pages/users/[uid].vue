<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  User,
  ArrowLeft,
  RefreshCw,
  Mail,
  Shield,
  Key,
  Database,
  Ban,
  CheckCircle2,
  Copy,
  ExternalLink,
  AlertCircle,
  Loader2,
} from 'lucide-vue-next'
import { useConnectionStore } from '~/stores/connection'
import { useRgwAdmin, type RgwUserDetails, type RgwBucketInfo } from '~/composables/useRgwAdmin'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const store = useConnectionStore()
const admin = useRgwAdmin()

// =============================================================================
// STATE
// =============================================================================

const userId = computed(() => decodeURIComponent(route.params['uid'] as string))

const user = ref<RgwUserDetails | null>(null)
const userBuckets = ref<RgwBucketInfo[]>([])
const loading = ref(true)
const bucketsLoading = ref(false)
const error = ref<string | null>(null)
const suspendLoading = ref(false)
const suspendError = ref<string | null>(null)

// =============================================================================
// LIFECYCLE
// =============================================================================

onMounted(async () => {
  if (!store.connected) {
    router.replace('/connect')
    return
  }

  await loadUser()
})

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadUser() {
  loading.value = true
  error.value = null

  const result = await admin.getUserDetails(userId.value)

  if (result.success && result.data) {
    user.value = result.data
    // Load buckets in background
    loadUserBuckets()
  } else {
    error.value = result.error ?? 'Failed to load user'
  }

  loading.value = false
}

async function loadUserBuckets() {
  bucketsLoading.value = true

  const result = await admin.getUserBuckets(userId.value)

  if (result.success && result.data) {
    userBuckets.value = result.data
  }

  bucketsLoading.value = false
}

// =============================================================================
// ACTIONS
// =============================================================================

async function toggleSuspend() {
  if (!user.value) return

  suspendLoading.value = true
  suspendError.value = null

  const result = user.value.suspended
    ? await admin.enableUser(userId.value)
    : await admin.suspendUser(userId.value)

  if (result.success) {
    // Reload user data to get updated state
    await loadUser()
  } else {
    suspendError.value = result.error ?? 'Failed to update user status'
  }

  suspendLoading.value = false
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

function navigateToBucket(bucketName: string) {
  router.push(`/browse/${bucketName}`)
}

// =============================================================================
// HELPERS
// =============================================================================

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 0) return 'Unlimited'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i === 0) return `${bytes} B`
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
}

function formatNumber(num: number): string {
  if (num < 0) return 'Unlimited'
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString()
}

function formatCapabilities(caps: Array<{ type: string; perm: string }>): string {
  if (caps.length === 0) return 'None'
  return caps.map(c => `${c.type}:${c.perm}`).join(', ')
}
</script>

<template>
  <LayoutAppLayout>
    <template #header>
      <header class="sticky top-0 z-40 bg-bg-primary/95 backdrop-blur-md border-b border-border-subtle">
        <div class="px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <!-- Back button -->
              <button
                type="button"
                class="p-2 -ml-2 rounded-lg hover:bg-bg-secondary transition-colors"
                @click="router.push('/users')"
              >
                <ArrowLeft class="w-5 h-5 text-text-secondary" />
              </button>

              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-accent-secondary/10 border border-accent-secondary/20 flex items-center justify-center">
                  <User class="w-5 h-5 text-accent-secondary" />
                </div>
                <div>
                  <h1 class="text-xl font-semibold text-text-primary font-mono">{{ userId }}</h1>
                  <p v-if="user?.displayName" class="text-xs text-text-secondary">{{ user.displayName }}</p>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <!-- Status badge -->
              <template v-if="user">
                <span
                  v-if="user.suspended"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-error/10 text-error border border-error/20"
                >
                  <Ban class="w-4 h-4" />
                  Suspended
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-tertiary/10 text-accent-tertiary border border-accent-tertiary/20"
                >
                  <CheckCircle2 class="w-4 h-4" />
                  Active
                </span>
              </template>

              <div class="w-px h-6 bg-border-subtle" />

              <!-- Refresh -->
              <UiButton
                variant="ghost"
                size="sm"
                :disabled="loading"
                @click="loadUser"
              >
                <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
                Refresh
              </UiButton>
            </div>
          </div>
        </div>
      </header>
    </template>

    <div>
      <!-- Error state -->
      <div
        v-if="error && !loading"
        class="bg-error/10 border border-error/20 rounded-xl p-6 text-center"
      >
        <p class="text-error mb-4">{{ error }}</p>
        <UiButton variant="secondary" @click="loadUser">
          Try Again
        </UiButton>
      </div>

      <!-- Loading state -->
      <div v-else-if="loading" class="space-y-6">
        <div class="h-48 bg-bg-secondary rounded-xl animate-pulse" />
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="h-64 bg-bg-secondary rounded-xl animate-pulse" />
          <div class="h-64 bg-bg-secondary rounded-xl animate-pulse" />
        </div>
      </div>

      <!-- User details -->
      <div v-else-if="user" class="space-y-6">
        <!-- User Info Card -->
        <section class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
          <h2 class="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
            <User class="w-5 h-5 text-accent-secondary" />
            {{ t('users.detail.user_information') }}
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- User ID -->
            <div>
              <p class="text-xs text-text-tertiary uppercase tracking-wider mb-1">{{ t('users.detail.user_id') }}</p>
              <div class="flex items-center gap-2">
                <p class="font-mono text-text-primary">{{ user.userId }}</p>
                <button
                  type="button"
                  class="p-1 rounded hover:bg-bg-tertiary transition-colors"
                  :title="t('users.detail.copy_user_id')"
                  @click="copyToClipboard(user.userId)"
                >
                  <Copy class="w-3.5 h-3.5 text-text-tertiary" />
                </button>
              </div>
            </div>

            <!-- Display Name -->
            <div>
              <p class="text-xs text-text-tertiary uppercase tracking-wider mb-1">{{ t('users.detail.display_name') }}</p>
              <p class="text-text-primary">{{ user.displayName || '—' }}</p>
            </div>

            <!-- Email -->
            <div>
              <p class="text-xs text-text-tertiary uppercase tracking-wider mb-1">{{ t('users.detail.email') }}</p>
              <div v-if="user.email" class="flex items-center gap-2">
                <Mail class="w-4 h-4 text-text-tertiary" />
                <p class="text-text-primary">{{ user.email }}</p>
              </div>
              <p v-else class="text-text-tertiary">—</p>
            </div>

            <!-- Tenant -->
            <div v-if="user.tenant">
              <p class="text-xs text-text-tertiary uppercase tracking-wider mb-1">{{ t('users.detail.tenant') }}</p>
              <p class="font-mono text-text-primary">{{ user.tenant }}</p>
            </div>

            <!-- Max Buckets -->
            <div>
              <p class="text-xs text-text-tertiary uppercase tracking-wider mb-1">{{ t('users.detail.max_buckets') }}</p>
              <p class="font-mono text-text-primary">
                {{ user.maxBuckets === -1 ? t('common.terms.unlimited') : user.maxBuckets }}
              </p>
            </div>

            <!-- Capabilities -->
            <div>
              <p class="text-xs text-text-tertiary uppercase tracking-wider mb-1">{{ t('users.detail.capabilities') }}</p>
              <p class="text-sm text-text-secondary font-mono">{{ formatCapabilities(user.caps) }}</p>
            </div>
          </div>

          <!-- Suspend/Enable Toggle -->
          <div class="mt-6 pt-6 border-t border-border-subtle">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-text-primary">{{ t('users.detail.account_status') }}</p>
                <p class="text-xs text-text-tertiary mt-0.5">
                  {{ user.suspended ? t('users.detail.suspended_description') : t('users.detail.active_description') }}
                </p>
              </div>
              <div class="flex items-center gap-3">
                <div v-if="suspendError" class="flex items-center gap-1.5 text-error text-sm">
                  <AlertCircle class="w-4 h-4" />
                  {{ suspendError }}
                </div>
                <UiButton
                  :variant="user.suspended ? 'primary' : 'danger'"
                  size="sm"
                  :disabled="suspendLoading"
                  @click="toggleSuspend"
                >
                  <Loader2 v-if="suspendLoading" class="w-4 h-4 animate-spin" />
                  <template v-else>
                    <CheckCircle2 v-if="user.suspended" class="w-4 h-4" />
                    <Ban v-else class="w-4 h-4" />
                  </template>
                  {{ user.suspended ? t('users.detail.enable_user') : t('users.detail.suspend_user') }}
                </UiButton>
              </div>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Quotas Card -->
          <section class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
            <h2 class="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
              <Shield class="w-5 h-5 text-accent-primary" />
              {{ t('users.detail.quotas.title') }}
            </h2>

            <div class="space-y-4">
              <!-- User Quota -->
              <div class="p-4 bg-bg-tertiary/50 rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-sm font-medium text-text-primary">{{ t('users.detail.quotas.user_quota') }}</p>
                  <span
                    :class="user.userQuota.enabled ? 'bg-accent-tertiary/10 text-accent-tertiary' : 'bg-bg-tertiary text-text-tertiary'"
                    class="px-2 py-0.5 rounded text-xs font-medium"
                  >
                    {{ user.userQuota.enabled ? t('common.status.enabled') : t('common.status.disabled') }}
                  </span>
                </div>
                <div v-if="user.userQuota.enabled" class="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <p class="text-xs text-text-tertiary">{{ t('users.detail.quotas.max_size') }}</p>
                    <p class="font-mono text-text-secondary">{{ formatSize(user.userQuota.maxSize) }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-text-tertiary">{{ t('users.detail.quotas.max_objects') }}</p>
                    <p class="font-mono text-text-secondary">{{ formatNumber(user.userQuota.maxObjects) }}</p>
                  </div>
                </div>
              </div>

              <!-- Bucket Quota -->
              <div class="p-4 bg-bg-tertiary/50 rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-sm font-medium text-text-primary">{{ t('users.detail.quotas.bucket_quota') }}</p>
                  <span
                    :class="user.bucketQuota.enabled ? 'bg-accent-tertiary/10 text-accent-tertiary' : 'bg-bg-tertiary text-text-tertiary'"
                    class="px-2 py-0.5 rounded text-xs font-medium"
                  >
                    {{ user.bucketQuota.enabled ? t('common.status.enabled') : t('common.status.disabled') }}
                  </span>
                </div>
                <div v-if="user.bucketQuota.enabled" class="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <p class="text-xs text-text-tertiary">{{ t('users.detail.quotas.max_size') }}</p>
                    <p class="font-mono text-text-secondary">{{ formatSize(user.bucketQuota.maxSize) }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-text-tertiary">{{ t('users.detail.quotas.max_objects') }}</p>
                    <p class="font-mono text-text-secondary">{{ formatNumber(user.bucketQuota.maxObjects) }}</p>
                  </div>
                </div>
              </div>

              <!-- Usage Stats -->
              <div v-if="user.stats" class="p-4 bg-bg-tertiary/50 rounded-lg">
                <p class="text-sm font-medium text-text-primary mb-3">{{ t('users.detail.quotas.current_usage') }}</p>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <p class="text-xs text-text-tertiary">{{ t('users.detail.quotas.storage_used') }}</p>
                    <p class="font-mono text-lg text-text-primary">{{ formatSize(user.stats.size) }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-text-tertiary">{{ t('users.table.objects') }}</p>
                    <p class="font-mono text-lg text-text-primary">{{ formatNumber(user.stats.numObjects) }}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Access Keys Card -->
          <section class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
            <h2 class="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
              <Key class="w-5 h-5 text-accent-secondary" />
              {{ t('users.detail.access_keys.title') }}
            </h2>

            <div v-if="user.keys.length === 0" class="text-center py-6">
              <Key class="w-8 h-8 text-text-tertiary mx-auto mb-2" />
              <p class="text-text-secondary text-sm">{{ t('users.detail.access_keys.empty') }}</p>
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="(key, index) in user.keys"
                :key="key.accessKey"
                class="p-4 bg-bg-tertiary/50 rounded-lg"
              >
                <div class="flex items-center justify-between mb-2">
                  <p class="text-xs text-text-tertiary">{{ t('users.detail.access_keys.key_number', { n: index + 1 }) }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <code class="font-mono text-sm text-text-primary bg-bg-primary px-2 py-1 rounded flex-1 truncate">
                    {{ key.accessKey }}
                  </code>
                  <button
                    type="button"
                    class="p-2 rounded-lg hover:bg-bg-hover transition-colors"
                    :title="t('users.detail.access_keys.copy_access_key')"
                    @click="copyToClipboard(key.accessKey)"
                  >
                    <Copy class="w-4 h-4 text-text-tertiary" />
                  </button>
                </div>
                <p class="text-xs text-text-tertiary mt-2">
                  {{ t('users.detail.access_keys.secret_hidden') }}
                </p>
              </div>
            </div>
          </section>
        </div>

        <!-- User Buckets -->
        <section class="bg-bg-secondary border border-border-subtle rounded-xl p-6">
          <h2 class="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
            <Database class="w-5 h-5 text-accent-tertiary" />
            {{ t('users.detail.buckets.title') }}
            <span class="text-sm font-normal text-text-tertiary">({{ userBuckets.length }})</span>
          </h2>

          <!-- Loading -->
          <div v-if="bucketsLoading" class="space-y-2">
            <div v-for="i in 3" :key="i" class="h-12 bg-bg-tertiary/50 rounded-lg animate-pulse" />
          </div>

          <!-- Empty -->
          <div v-else-if="userBuckets.length === 0" class="text-center py-8">
            <Database class="w-8 h-8 text-text-tertiary mx-auto mb-2" />
            <p class="text-text-secondary text-sm">{{ t('users.detail.buckets.empty') }}</p>
          </div>

          <!-- Bucket list -->
          <div v-else class="space-y-2">
            <button
              v-for="bucket in userBuckets"
              :key="bucket.bucket"
              type="button"
              class="w-full flex items-center justify-between p-4 bg-bg-tertiary/50 rounded-lg hover:bg-bg-hover transition-colors text-left group"
              @click="navigateToBucket(bucket.bucket)"
            >
              <div class="flex items-center gap-3">
                <Database class="w-5 h-5 text-accent-tertiary" />
                <div>
                  <p class="font-mono text-sm text-text-primary">{{ bucket.bucket }}</p>
                  <div v-if="bucket.usage" class="flex items-center gap-3 mt-0.5">
                    <span class="text-xs text-text-tertiary">
                      {{ Object.values(bucket.usage).reduce((acc, u) => acc + (u.numObjects || 0), 0) }} objects
                    </span>
                    <span class="text-xs text-text-tertiary">
                      {{ formatSize(Object.values(bucket.usage).reduce((acc, u) => acc + (u.size || 0), 0)) }}
                    </span>
                  </div>
                </div>
              </div>
              <ExternalLink class="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </section>
      </div>
    </div>
  </LayoutAppLayout>
</template>
