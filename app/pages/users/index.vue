<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Users,
  RefreshCw,
  Search,
  ArrowUpRight,
  User,
  Ban,
  CheckCircle2,
  HardDrive,
  Database,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-vue-next'
import { useConnectionStore } from '~/stores/connection'
import { useRgwAdmin, type RgwUserInfo, type RgwUserDetails, type CreateUserOptions, type CreateUserResult } from '~/composables/useRgwAdmin'

const { t } = useI18n()
const router = useRouter()
const store = useConnectionStore()
const admin = useRgwAdmin()

// =============================================================================
// STATE
// =============================================================================

const users = ref<RgwUserInfo[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const searchQuery = ref('')

// Pagination
const currentPage = ref(1)
const pageSize = 20

// Create User Modal
const showCreateModal = ref(false)
const creatingUser = ref(false)
const createError = ref<string | null>(null)

// Credentials Modal (shown after successful user creation)
const showCredentialsModal = ref(false)
const createdUser = ref<CreateUserResult | null>(null)

// Current user details (for capability-aware form)
const currentUserDetails = ref<RgwUserDetails | null>(null)

// =============================================================================
// COMPUTED
// =============================================================================

const filteredUsers = computed(() => {
  if (!searchQuery.value.trim()) return users.value

  const query = searchQuery.value.toLowerCase()
  return users.value.filter(user =>
    user.userId.toLowerCase().includes(query) ||
    user.displayName.toLowerCase().includes(query) ||
    user.email?.toLowerCase().includes(query)
  )
})

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredUsers.value.slice(start, start + pageSize)
})

const totalPages = computed(() => Math.ceil(filteredUsers.value.length / pageSize))

const hasCapability = computed(() => store.capabilities.users)

// =============================================================================
// LIFECYCLE
// =============================================================================

onMounted(async () => {
  if (!store.connected) {
    router.replace('/connect')
    return
  }

  if (!store.capabilities.users) {
    // Wait a bit for capability probing to complete
    await new Promise(resolve => setTimeout(resolve, 1000))
    if (!store.capabilities.users) {
      error.value = 'You do not have permission to view users. User admin capability required.'
      loading.value = false
      return
    }
  }

  await loadUsers()
  // Load current user details in background for capability-aware form
  loadCurrentUserDetails()
})

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadUsers() {
  loading.value = true
  error.value = null

  // Get list of all user IDs
  const listResult = await admin.listUsers()
  if (!listResult.success || !listResult.data) {
    error.value = listResult.error ?? 'Failed to load users'
    loading.value = false
    return
  }

  // Get detailed info for all users
  const infoResult = await admin.getUsersInfo(listResult.data)
  if (!infoResult.success || !infoResult.data) {
    error.value = infoResult.error ?? 'Failed to load user details'
    loading.value = false
    return
  }

  users.value = infoResult.data.sort((a, b) => a.userId.localeCompare(b.userId))
  loading.value = false
}

// =============================================================================
// ACTIONS
// =============================================================================

function viewUser(user: RgwUserInfo) {
  router.push(`/users/${encodeURIComponent(user.userId)}`)
}

function prevPage() {
  if (currentPage.value > 1) currentPage.value--
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++
}

async function loadCurrentUserDetails() {
  // Try to get the current user's details to determine what capabilities they can grant
  // We'll use the first access key user ID from the connection
  // This is a best-effort approach - if it fails, the form will just hide the capabilities section
  try {
    const listResult = await admin.listUsers()
    if (listResult.success && listResult.data && listResult.data.length > 0) {
      // Find a user that might be the current admin user
      // For now, just get the first user's details as a fallback
      // In a real scenario, you'd want to identify the current user
      for (const uid of listResult.data) {
        const detailsResult = await admin.getUserDetails(uid)
        if (detailsResult.success && detailsResult.data && detailsResult.data.caps?.length > 0) {
          currentUserDetails.value = detailsResult.data
          break
        }
      }
    }
  } catch {
    // Silently fail - the form will just not show capabilities section
  }
}

async function handleCreateUser(options: CreateUserOptions) {
  creatingUser.value = true
  createError.value = null

  const result = await admin.createUser(options)

  if (result.success && result.data) {
    showCreateModal.value = false
    createdUser.value = result.data
    showCredentialsModal.value = true
    // Refresh the user list
    await loadUsers()
  } else {
    createError.value = result.error ?? t('users.create_error')
  }

  creatingUser.value = false
}

function handleCredentialsDone() {
  showCredentialsModal.value = false
  createdUser.value = null
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
</script>

<template>
  <LayoutAppLayout :title="t('users.title')" show-endpoint>
    <template #actions>
      <!-- Search -->
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('users.search_placeholder')"
          class="w-64 pl-9 pr-4 py-2 text-sm bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-secondary/50 transition-colors"
        />
      </div>

      <div class="w-px h-6 bg-border-subtle" />

      <!-- Create User (only if users capability) -->
      <UiButton
        v-if="hasCapability"
        variant="primary"
        size="sm"
        @click="showCreateModal = true"
      >
        <Plus class="w-4 h-4" />
        {{ t('users.create.button') }}
      </UiButton>

      <!-- Refresh -->
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="loading"
        @click="loadUsers"
      >
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        {{ t('common.actions.refresh') }}
      </UiButton>
    </template>

    <div>
      <!-- No capability error -->
      <div
        v-if="!hasCapability && !loading"
        class="bg-warning/10 border border-warning/20 rounded-xl p-8 text-center"
      >
        <Ban class="w-12 h-12 text-warning mx-auto mb-4" />
        <h2 class="text-lg font-medium text-text-primary mb-2">Access Denied</h2>
        <p class="text-text-secondary mb-4">You do not have permission to view users.</p>
        <p class="text-sm text-text-tertiary">Requires <code class="font-mono bg-bg-tertiary px-2 py-0.5 rounded">users:*</code> capability.</p>
      </div>

      <!-- Error state -->
      <div
        v-else-if="error && !loading"
        class="bg-error/10 border border-error/20 rounded-xl p-6 text-center"
      >
        <p class="text-error mb-4">{{ error }}</p>
        <UiButton variant="secondary" @click="loadUsers">
          Try Again
        </UiButton>
      </div>

      <!-- Loading state -->
      <div v-else-if="loading" class="space-y-2">
        <div
          v-for="i in 10"
          :key="i"
          class="h-14 bg-bg-secondary rounded-lg animate-pulse"
        />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="users.length === 0"
        class="bg-bg-secondary border border-border-subtle rounded-xl p-8 text-center"
      >
        <Users class="w-12 h-12 text-text-tertiary mx-auto mb-3" />
        <h3 class="text-lg font-medium text-text-primary mb-2">{{ t('users.empty.title') }}</h3>
        <p class="text-text-secondary mb-4">{{ t('users.empty.description') }}</p>
        <UiButton
          v-if="hasCapability"
          variant="primary"
          @click="showCreateModal = true"
        >
          <Plus class="w-4 h-4" />
          {{ t('users.create.button') }}
        </UiButton>
      </div>

      <!-- Users table -->
      <div v-else class="bg-bg-secondary border border-border-subtle rounded-xl overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border-subtle bg-bg-tertiary/50">
              <th class="text-left text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
                {{ t('users.table.user') }}
              </th>
              <th class="text-left text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
                {{ t('users.table.display_name') }}
              </th>
              <th class="text-left text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
                {{ t('users.table.status') }}
              </th>
              <th class="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
                {{ t('users.table.objects') }}
              </th>
              <th class="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
                {{ t('users.table.storage') }}
              </th>
              <th class="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
                {{ t('users.table.max_buckets') }}
              </th>
              <th class="w-12"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-subtle">
            <tr
              v-for="user in paginatedUsers"
              :key="user.userId"
              class="hover:bg-bg-hover transition-colors cursor-pointer group"
              @click="viewUser(user)"
            >
              <!-- User ID -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-accent-secondary/10 flex items-center justify-center flex-shrink-0">
                    <User class="w-4 h-4 text-accent-secondary" />
                  </div>
                  <div>
                    <p class="font-mono text-sm text-text-primary">{{ user.userId }}</p>
                    <p v-if="user.email" class="text-xs text-text-tertiary">{{ user.email }}</p>
                  </div>
                </div>
              </td>

              <!-- Display Name -->
              <td class="px-4 py-3">
                <span class="text-sm text-text-secondary">{{ user.displayName || '—' }}</span>
              </td>

              <!-- Status -->
              <td class="px-4 py-3">
                <span
                  v-if="user.suspended"
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-error/10 text-error"
                >
                  <Ban class="w-3 h-3" />
                  Suspended
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-accent-tertiary/10 text-accent-tertiary"
                >
                  <CheckCircle2 class="w-3 h-3" />
                  Active
                </span>
              </td>

              <!-- Objects -->
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <Database class="w-3.5 h-3.5 text-text-tertiary" />
                  <span class="font-mono text-sm text-text-secondary">
                    {{ user.stats ? formatNumber(user.stats.numObjects) : '—' }}
                  </span>
                </div>
              </td>

              <!-- Storage -->
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <HardDrive class="w-3.5 h-3.5 text-text-tertiary" />
                  <span class="font-mono text-sm text-text-secondary">
                    {{ user.stats ? formatSize(user.stats.size) : '—' }}
                  </span>
                </div>
              </td>

              <!-- Max Buckets -->
              <td class="px-4 py-3 text-right">
                <span class="font-mono text-sm text-text-tertiary">
                  {{ user.maxBuckets === -1 ? 'Unlimited' : user.maxBuckets }}
                </span>
              </td>

              <!-- Action -->
              <td class="px-4 py-3">
                <ArrowUpRight class="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div
          v-if="totalPages > 1"
          class="flex items-center justify-between px-4 py-3 border-t border-border-subtle bg-bg-tertiary/30"
        >
          <p class="text-sm text-text-tertiary">
            Showing {{ (currentPage - 1) * pageSize + 1 }} to {{ Math.min(currentPage * pageSize, filteredUsers.length) }} of {{ filteredUsers.length }} users
          </p>
          <div class="flex items-center gap-2">
            <UiButton
              variant="ghost"
              size="sm"
              :disabled="currentPage === 1"
              @click="prevPage"
            >
              <ChevronLeft class="w-4 h-4" />
            </UiButton>
            <span class="text-sm text-text-secondary px-2">
              Page {{ currentPage }} of {{ totalPages }}
            </span>
            <UiButton
              variant="ghost"
              size="sm"
              :disabled="currentPage === totalPages"
              @click="nextPage"
            >
              <ChevronRight class="w-4 h-4" />
            </UiButton>
          </div>
        </div>
      </div>

      <!-- User count -->
      <div
        v-if="!loading && !error && users.length > 0"
        class="mt-4 text-center text-sm text-text-tertiary"
      >
        {{ filteredUsers.length }} user{{ filteredUsers.length === 1 ? '' : 's' }}
        <span v-if="searchQuery" class="text-text-tertiary/70">(filtered from {{ users.length }})</span>
      </div>

      <!-- Create error toast -->
      <div
        v-if="createError"
        class="fixed bottom-4 right-4 max-w-md p-4 bg-error/10 border border-error/20 rounded-lg shadow-lg z-50"
      >
        <div class="flex items-start gap-3">
          <Ban class="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-error">{{ t('users.create_error') }}</p>
            <p class="text-xs text-error/80 mt-1">{{ createError }}</p>
          </div>
          <button
            type="button"
            class="text-error/60 hover:text-error transition-colors"
            @click="createError = null"
          >
            <span class="sr-only">Dismiss</span>
            &times;
          </button>
        </div>
      </div>
    </div>

    <!-- Create User Modal -->
    <UserCreateModal
      :open="showCreateModal"
      :loading="creatingUser"
      :current-user-details="currentUserDetails"
      @update:open="showCreateModal = $event"
      @create="handleCreateUser"
    />

    <!-- Credentials Modal (shown after successful creation) -->
    <UserCredentialsModal
      :open="showCredentialsModal"
      :user="createdUser"
      @update:open="showCredentialsModal = $event"
      @done="handleCredentialsDone"
    />
  </LayoutAppLayout>
</template>
