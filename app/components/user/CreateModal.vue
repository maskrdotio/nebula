<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  User,
  Key,
  HardDrive,
  Database,
  Shield,
  ChevronDown,
  ChevronUp,
  Info,
  AlertCircle,
} from 'lucide-vue-next'
import type { CreateUserOptions, RgwUserDetails } from '~/composables/useRgwAdmin'

const { t } = useI18n()

// Capability types
type CapabilityType = 'buckets' | 'users' | 'usage' | 'metadata' | 'zone'
type CapabilityPerm = 'read' | 'write' | '*'

interface CapabilityGrant {
  type: CapabilityType
  perm: CapabilityPerm
}

interface Props {
  open: boolean
  loading?: boolean
  currentUserDetails?: RgwUserDetails | null
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  currentUserDetails: null,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  create: [options: CreateUserOptions]
}>()

// =============================================================================
// FORM STATE
// =============================================================================

// Basic Info
const userId = ref('')
const showTenant = ref(false)
const tenant = ref('')
const displayName = ref('')
const email = ref('')
const maxBucketsMode = ref<'unlimited' | 'custom'>('unlimited')
const maxBucketsValue = ref(1000)
const suspended = ref(false)
const systemUser = ref(false)

// S3 Credentials
const autoGenerateKey = ref(true)
const accessKey = ref('')
const secretKey = ref('')

// User Quota
const enableUserQuota = ref(false)
const userQuotaSize = ref(100)
const userQuotaSizeUnit = ref<'GB' | 'TB'>('GB')
const userQuotaObjects = ref(1000000)

// Bucket Quota
const enableBucketQuota = ref(false)
const bucketQuotaSize = ref(10)
const bucketQuotaSizeUnit = ref<'GB' | 'TB'>('GB')
const bucketQuotaObjects = ref(100000)

// Capabilities
const showCapabilities = ref(false)
const selectedCaps = ref<CapabilityGrant[]>([])

// Validation state
const touched = ref({
  userId: false,
  displayName: false,
  email: false,
  accessKey: false,
  secretKey: false,
})

// =============================================================================
// CAPABILITY LOGIC
// =============================================================================

const allCapTypes: CapabilityType[] = ['buckets', 'users', 'usage', 'metadata', 'zone']

// Get the current user's capabilities from their details
const currentUserCaps = computed(() => {
  if (!props.currentUserDetails?.caps) return new Map<CapabilityType, CapabilityPerm>()

  const capsMap = new Map<CapabilityType, CapabilityPerm>()
  for (const cap of props.currentUserDetails.caps) {
    const capType = cap.type as CapabilityType
    if (allCapTypes.includes(capType)) {
      capsMap.set(capType, cap.perm as CapabilityPerm)
    }
  }
  return capsMap
})

// Determine which capabilities the current user can grant
const grantableCapabilities = computed(() => {
  const grantable: Array<{ type: CapabilityType; maxPerm: CapabilityPerm; options: CapabilityPerm[] }> = []

  for (const capType of allCapTypes) {
    const userPerm = currentUserCaps.value.get(capType)
    if (!userPerm) continue

    // User can grant up to their own level
    const options: CapabilityPerm[] = []
    if (userPerm === '*') {
      options.push('read', 'write', '*')
    } else if (userPerm === 'write') {
      options.push('read', 'write')
    } else if (userPerm === 'read') {
      options.push('read')
    }

    if (options.length > 0) {
      grantable.push({ type: capType, maxPerm: userPerm, options })
    }
  }

  return grantable
})

const canGrantAnyCapability = computed(() => grantableCapabilities.value.length > 0)

// Get selected permission for a capability type
function getSelectedPerm(capType: CapabilityType): CapabilityPerm | '' {
  const cap = selectedCaps.value.find(c => c.type === capType)
  return cap?.perm ?? ''
}

// Set permission for a capability type
function setCapPerm(capType: CapabilityType, perm: CapabilityPerm | '') {
  const existing = selectedCaps.value.findIndex(c => c.type === capType)
  if (perm === '') {
    if (existing >= 0) {
      selectedCaps.value.splice(existing, 1)
    }
  } else {
    if (existing >= 0) {
      const cap = selectedCaps.value[existing]
      if (cap) {
        cap.perm = perm
      }
    } else {
      selectedCaps.value.push({ type: capType, perm })
    }
  }
}

// Format capabilities as string for API
function formatCapabilities(): string | undefined {
  if (selectedCaps.value.length === 0) return undefined
  return selectedCaps.value.map(c => `${c.type}=${c.perm}`).join(';')
}

// =============================================================================
// VALIDATION
// =============================================================================

const userIdValidation = computed(() => {
  if (!touched.value.userId || !userId.value) return ''

  const id = userId.value

  if (id.length < 1) return t('users.create.user_id.validation.required')
  if (id.length > 64) return t('users.create.user_id.validation.max_length')
  if (!/^[a-z0-9]/.test(id)) return t('users.create.user_id.validation.start_char')
  if (/[^a-z0-9\-]/.test(id)) return t('users.create.user_id.validation.allowed_chars')
  if (/\s/.test(id)) return t('users.create.user_id.validation.no_spaces')

  return ''
})

const displayNameValidation = computed(() => {
  if (!touched.value.displayName) return ''
  if (!displayName.value.trim()) return t('users.create.display_name.validation.required')
  return ''
})

const emailValidation = computed(() => {
  if (!touched.value.email || !email.value) return ''

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.value)) return t('users.create.email.validation.invalid')

  return ''
})

const accessKeyValidation = computed(() => {
  if (autoGenerateKey.value) return ''
  if (!touched.value.accessKey || !accessKey.value) return ''
  if (accessKey.value.length < 16) return t('users.create.credentials.access_key.validation.min_length')
  return ''
})

const secretKeyValidation = computed(() => {
  if (autoGenerateKey.value) return ''
  if (!touched.value.secretKey || !secretKey.value) return ''
  if (secretKey.value.length < 32) return t('users.create.credentials.secret_key.validation.min_length')
  return ''
})

const isValid = computed(() => {
  // Required fields
  if (!userId.value.trim()) return false
  if (!displayName.value.trim()) return false

  // Validation errors
  if (userIdValidation.value) return false
  if (displayNameValidation.value) return false
  if (emailValidation.value) return false

  // Manual key validation (only if not auto-generating)
  if (!autoGenerateKey.value) {
    if (!accessKey.value.trim()) return false
    if (!secretKey.value.trim()) return false
    if (accessKeyValidation.value) return false
    if (secretKeyValidation.value) return false
  }

  return true
})

// =============================================================================
// HELPERS
// =============================================================================

function convertToBytes(value: number, unit: 'GB' | 'TB'): number {
  const multiplier = unit === 'TB' ? 1024 * 1024 * 1024 * 1024 : 1024 * 1024 * 1024
  return value * multiplier
}

function capTypeLabel(type: CapabilityType): string {
  return t(`users.create.capabilities.types.${type}`)
}

function permLabel(perm: CapabilityPerm): string {
  const permKey = perm === '*' ? 'full' : perm
  return t(`users.create.capabilities.permissions.${permKey}`)
}

// =============================================================================
// ACTIONS
// =============================================================================

function handleSubmit() {
  // Mark all fields as touched
  touched.value = {
    userId: true,
    displayName: true,
    email: true,
    accessKey: true,
    secretKey: true,
  }

  if (!isValid.value) return

  const options: CreateUserOptions = {
    uid: userId.value.trim(),
    displayName: displayName.value.trim(),
    tenant: showTenant.value && tenant.value.trim() ? tenant.value.trim() : undefined,
    email: email.value.trim() || undefined,
    maxBuckets: maxBucketsMode.value === 'unlimited' ? -1 : maxBucketsValue.value,
    suspended: suspended.value,
    systemUser: systemUser.value,
    generateKey: autoGenerateKey.value,
    accessKey: !autoGenerateKey.value ? accessKey.value.trim() : undefined,
    secretKey: !autoGenerateKey.value ? secretKey.value.trim() : undefined,
    userCaps: formatCapabilities(),
    userQuota: enableUserQuota.value ? {
      enabled: true,
      maxSize: convertToBytes(userQuotaSize.value, userQuotaSizeUnit.value),
      maxObjects: userQuotaObjects.value,
    } : undefined,
    bucketQuota: enableBucketQuota.value ? {
      enabled: true,
      maxSize: convertToBytes(bucketQuotaSize.value, bucketQuotaSizeUnit.value),
      maxObjects: bucketQuotaObjects.value,
    } : undefined,
  }

  emit('create', options)
}

function handleClose() {
  emit('update:open', false)
}

// Reset form when modal opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    userId.value = ''
    showTenant.value = false
    tenant.value = ''
    displayName.value = ''
    email.value = ''
    maxBucketsMode.value = 'unlimited'
    maxBucketsValue.value = 1000
    suspended.value = false
    systemUser.value = false
    autoGenerateKey.value = true
    accessKey.value = ''
    secretKey.value = ''
    enableUserQuota.value = false
    userQuotaSize.value = 100
    userQuotaSizeUnit.value = 'GB'
    userQuotaObjects.value = 1000000
    enableBucketQuota.value = false
    bucketQuotaSize.value = 10
    bucketQuotaSizeUnit.value = 'GB'
    bucketQuotaObjects.value = 100000
    showCapabilities.value = false
    selectedCaps.value = []
    touched.value = {
      userId: false,
      displayName: false,
      email: false,
      accessKey: false,
      secretKey: false,
    }
  }
})
</script>

<template>
  <UiModal
    :open="open"
    :title="t('users.create.title')"
    :description="t('users.create.description')"
    size="lg"
    @update:open="emit('update:open', $event)"
  >
    <form @submit.prevent="handleSubmit" class="space-y-6">
      <!-- User icon -->
      <div class="flex justify-center">
        <div class="w-14 h-14 rounded-xl bg-bg-secondary border border-border-subtle flex items-center justify-center">
          <User class="w-7 h-7 text-accent-secondary" :stroke-width="1.5" />
        </div>
      </div>

      <!-- Section: Basic Info -->
      <div class="space-y-4">
        <div class="flex items-center gap-2 text-sm font-medium text-text-primary">
          <User class="w-4 h-4 text-text-tertiary" />
          {{ t('users.create.basic_info') }}
        </div>

        <!-- User ID -->
        <UiInput
          v-model="userId"
          :label="t('users.create.user_id.label')"
          placeholder="my-user"
          :error="userIdValidation"
          :hint="t('users.create.user_id.hint')"
          required
          autocomplete="off"
          monospace
          @blur="touched.userId = true"
        />

        <!-- Tenant (hidden by default) -->
        <div>
          <label class="flex items-center gap-2 cursor-pointer mb-2">
            <input
              v-model="showTenant"
              type="checkbox"
              class="w-4 h-4 rounded border-border-default bg-bg-primary text-accent-primary focus:ring-accent-primary/50"
            />
            <span class="text-sm text-text-secondary">{{ t('users.create.tenant.show') }}</span>
          </label>

          <UiInput
            v-if="showTenant"
            v-model="tenant"
            :label="t('users.create.tenant.label')"
            placeholder="tenant-name"
            :hint="t('users.create.tenant.hint')"
            autocomplete="off"
            monospace
          />
        </div>

        <!-- Display Name -->
        <UiInput
          v-model="displayName"
          :label="t('users.create.display_name.label')"
          placeholder="John Doe"
          :error="displayNameValidation"
          required
          autocomplete="off"
          @blur="touched.displayName = true"
        />

        <!-- Email -->
        <UiInput
          v-model="email"
          :label="t('users.create.email.label')"
          placeholder="user@example.com"
          type="email"
          :error="emailValidation"
          autocomplete="off"
          @blur="touched.email = true"
        />

        <!-- Max Buckets -->
        <div>
          <label class="block text-sm font-medium text-text-secondary mb-1.5">
            {{ t('users.create.max_buckets.label') }}
          </label>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="maxBucketsMode"
                type="radio"
                value="unlimited"
                class="w-4 h-4 border-border-default bg-bg-primary text-accent-primary focus:ring-accent-primary/50"
              />
              <span class="text-sm text-text-primary">{{ t('users.create.max_buckets.unlimited') }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="maxBucketsMode"
                type="radio"
                value="custom"
                class="w-4 h-4 border-border-default bg-bg-primary text-accent-primary focus:ring-accent-primary/50"
              />
              <span class="text-sm text-text-primary">{{ t('users.create.max_buckets.custom') }}</span>
            </label>
            <input
              v-if="maxBucketsMode === 'custom'"
              v-model.number="maxBucketsValue"
              type="number"
              min="0"
              max="1000000"
              class="w-24 h-9 px-3 bg-bg-secondary border border-border-default rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
            />
          </div>
        </div>

        <!-- Suspended & System User toggles -->
        <div class="flex flex-col gap-3 p-3 bg-bg-secondary rounded-lg border border-border-subtle">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm text-text-primary">{{ t('users.create.suspended.label') }}</span>
              <div class="group relative">
                <Info class="w-3.5 h-3.5 text-text-tertiary cursor-help" />
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-bg-tertiary border border-border-default rounded-lg text-xs text-text-secondary opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-lg">
                  {{ t('users.create.suspended.tooltip') }}
                </div>
              </div>
            </div>
            <UiToggle v-model="suspended" />
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm text-text-primary">{{ t('users.create.system_user.label') }}</span>
              <div class="group relative">
                <Info class="w-3.5 h-3.5 text-text-tertiary cursor-help" />
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-bg-tertiary border border-border-default rounded-lg text-xs text-text-secondary opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-lg">
                  {{ t('users.create.system_user.tooltip') }}
                </div>
              </div>
            </div>
            <UiToggle v-model="systemUser" />
          </div>
        </div>
      </div>

      <!-- Section: S3 Credentials -->
      <div class="space-y-4">
        <div class="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Key class="w-4 h-4 text-text-tertiary" />
          {{ t('users.create.credentials.section') }}
        </div>

        <div class="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border-subtle">
          <span class="text-sm text-text-primary">{{ t('users.create.credentials.auto_generate') }}</span>
          <UiToggle v-model="autoGenerateKey" />
        </div>

        <template v-if="!autoGenerateKey">
          <UiInput
            v-model="accessKey"
            :label="t('users.create.credentials.access_key.label')"
            placeholder="AKIAIOSFODNN7EXAMPLE"
            :error="accessKeyValidation"
            required
            autocomplete="off"
            monospace
            @blur="touched.accessKey = true"
          />

          <UiInput
            v-model="secretKey"
            :label="t('users.create.credentials.secret_key.label')"
            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            type="password"
            :error="secretKeyValidation"
            required
            autocomplete="off"
            monospace
            @blur="touched.secretKey = true"
          />
        </template>
      </div>

      <!-- Section: User Quota -->
      <div class="space-y-4">
        <div class="flex items-center gap-2 text-sm font-medium text-text-primary">
          <HardDrive class="w-4 h-4 text-text-tertiary" />
          {{ t('users.create.user_quota.section') }}
        </div>

        <div class="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border-subtle">
          <span class="text-sm text-text-primary">{{ t('users.create.user_quota.enable') }}</span>
          <UiToggle v-model="enableUserQuota" />
        </div>

        <template v-if="enableUserQuota">
          <div class="grid grid-cols-2 gap-4 p-3 bg-bg-secondary rounded-lg border border-border-subtle">
            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1.5">{{ t('users.create.user_quota.max_size') }}</label>
              <div class="flex gap-2">
                <input
                  v-model.number="userQuotaSize"
                  type="number"
                  min="1"
                  class="flex-1 h-9 px-3 bg-bg-primary border border-border-default rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
                />
                <select
                  v-model="userQuotaSizeUnit"
                  class="w-20 h-9 px-2 bg-bg-primary border border-border-default rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
                >
                  <option value="GB">GB</option>
                  <option value="TB">TB</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1.5">{{ t('users.create.user_quota.max_objects') }}</label>
              <input
                v-model.number="userQuotaObjects"
                type="number"
                min="1"
                class="w-full h-9 px-3 bg-bg-primary border border-border-default rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
              />
            </div>
          </div>
        </template>
      </div>

      <!-- Section: Bucket Quota -->
      <div class="space-y-4">
        <div class="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Database class="w-4 h-4 text-text-tertiary" />
          {{ t('users.create.bucket_quota.section') }}
        </div>

        <div class="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border-subtle">
          <span class="text-sm text-text-primary">{{ t('users.create.bucket_quota.enable') }}</span>
          <UiToggle v-model="enableBucketQuota" />
        </div>

        <template v-if="enableBucketQuota">
          <div class="grid grid-cols-2 gap-4 p-3 bg-bg-secondary rounded-lg border border-border-subtle">
            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1.5">{{ t('users.create.bucket_quota.max_size') }}</label>
              <div class="flex gap-2">
                <input
                  v-model.number="bucketQuotaSize"
                  type="number"
                  min="1"
                  class="flex-1 h-9 px-3 bg-bg-primary border border-border-default rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
                />
                <select
                  v-model="bucketQuotaSizeUnit"
                  class="w-20 h-9 px-2 bg-bg-primary border border-border-default rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
                >
                  <option value="GB">GB</option>
                  <option value="TB">TB</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1.5">{{ t('users.create.bucket_quota.max_objects') }}</label>
              <input
                v-model.number="bucketQuotaObjects"
                type="number"
                min="1"
                class="w-full h-9 px-3 bg-bg-primary border border-border-default rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
              />
            </div>
          </div>
        </template>
      </div>

      <!-- Section: Capabilities (collapsible) -->
      <div class="space-y-4">
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-2 bg-bg-secondary rounded-lg border border-border-subtle text-sm text-text-secondary hover:text-text-primary hover:border-border-default transition-colors"
          @click="showCapabilities = !showCapabilities"
        >
          <div class="flex items-center gap-2">
            <Shield class="w-4 h-4 text-text-tertiary" />
            <span>{{ t('users.create.capabilities.section') }}</span>
          </div>
          <component :is="showCapabilities ? ChevronUp : ChevronDown" class="w-4 h-4" />
        </button>

        <template v-if="showCapabilities">
          <div v-if="!canGrantAnyCapability" class="p-3 bg-warning/10 border border-warning/20 rounded-lg">
            <div class="flex items-center gap-2 text-warning text-sm">
              <AlertCircle class="w-4 h-4 flex-shrink-0" />
              <span>{{ t('users.create.capabilities.no_permission') }}</span>
            </div>
          </div>

          <div v-else class="space-y-3 p-3 bg-bg-secondary rounded-lg border border-border-subtle">
            <p class="text-xs text-text-tertiary">
              {{ t('users.create.capabilities.hint') }}
            </p>

            <div
              v-for="cap in grantableCapabilities"
              :key="cap.type"
              class="flex items-center justify-between"
            >
              <span class="text-sm text-text-primary">{{ capTypeLabel(cap.type) }}</span>
              <select
                :value="getSelectedPerm(cap.type)"
                class="w-32 h-8 px-2 bg-bg-primary border border-border-default rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
                @change="setCapPerm(cap.type, ($event.target as HTMLSelectElement).value as CapabilityPerm | '')"
              >
                <option value="">{{ t('users.create.capabilities.permissions.none') }}</option>
                <option
                  v-for="perm in cap.options"
                  :key="perm"
                  :value="perm"
                >
                  {{ permLabel(perm) }}
                </option>
              </select>
            </div>
          </div>
        </template>
      </div>
    </form>

    <template #footer>
      <UiButton
        variant="secondary"
        :disabled="loading"
        @click="handleClose"
      >
        {{ t('common.actions.cancel') }}
      </UiButton>
      <UiButton
        variant="primary"
        :disabled="!isValid"
        :loading="loading"
        @click="handleSubmit"
      >
        {{ t('users.create.button') }}
      </UiButton>
    </template>
  </UiModal>
</template>
