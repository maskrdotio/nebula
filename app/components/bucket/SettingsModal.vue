<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Settings,
  GitBranch,
  Clock,
  FileJson,
  Shield,
  HardDrive,
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Loader2,
  Lock,
  Tag,
  Key,
} from 'lucide-vue-next'
import {
  useS3Client,
  type BucketVersioning,
  type LifecycleRuleInfo,
  type BucketAcl,
  type BucketEncryption,
  type BucketTag,
  type ObjectLockConfig,
} from '~/composables/useS3Client'
import { useRgwAdmin, type RgwQuota, type RgwBucketInfo } from '~/composables/useRgwAdmin'
import { useConnectionStore } from '~/stores/connection'

interface Props {
  open: boolean
  bucket: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  refresh: []
}>()

const { t } = useI18n()
const s3 = useS3Client()
const admin = useRgwAdmin()
const store = useConnectionStore()

type TabId = 'versioning' | 'lifecycle' | 'policy' | 'acl' | 'quota' | 'encryption' | 'tags' | 'objectLock'

const tabs: Array<{ id: TabId; labelKey: string; icon: typeof Settings }> = [
  { id: 'versioning', labelKey: 'buckets.settings.versioning.tab', icon: GitBranch },
  { id: 'objectLock', labelKey: 'buckets.settings.object_lock.tab', icon: Lock },
  { id: 'encryption', labelKey: 'buckets.settings.encryption.tab', icon: Key },
  { id: 'lifecycle', labelKey: 'buckets.settings.lifecycle.tab', icon: Clock },
  { id: 'tags', labelKey: 'buckets.settings.tags.tab', icon: Tag },
  { id: 'policy', labelKey: 'buckets.settings.policy.tab', icon: FileJson },
  { id: 'acl', labelKey: 'buckets.settings.acl.tab', icon: Shield },
  { id: 'quota', labelKey: 'buckets.settings.quota.tab', icon: HardDrive },
]

const activeTab = ref<TabId>('versioning')

// Loading states
const loading = ref({
  versioning: false,
  lifecycle: false,
  policy: false,
  acl: false,
  quota: false,
  encryption: false,
  tags: false,
  objectLock: false,
})

const saving = ref({
  versioning: false,
  lifecycle: false,
  policy: false,
  quota: false,
  encryption: false,
  tags: false,
  objectLock: false,
})

// Error states
const errors = ref({
  versioning: null as string | null,
  lifecycle: null as string | null,
  policy: null as string | null,
  acl: null as string | null,
  quota: null as string | null,
  encryption: null as string | null,
  tags: null as string | null,
  objectLock: null as string | null,
})

// Permission states - tracks if user can edit each setting
const canEdit = ref({
  versioning: true,
  lifecycle: true,
  policy: true,
  acl: true,
  quota: true,
  encryption: true,
  tags: true,
  objectLock: true,
})

// Permission denied states - tracks if user can't even view
const permissionDenied = ref({
  versioning: false,
  lifecycle: false,
  policy: false,
  acl: false,
  quota: false,
  encryption: false,
  tags: false,
  objectLock: false,
})

/**
 * Check if an error indicates permission denied (403)
 */
function isPermissionError(error: string | null | undefined): boolean {
  if (!error) return false
  const lower = error.toLowerCase()
  return lower.includes('accessdenied') ||
         lower.includes('access denied') ||
         lower.includes('403') ||
         lower.includes('forbidden')
}

// Data states
const versioning = ref<BucketVersioning | null>(null)
const lifecycle = ref<LifecycleRuleInfo[]>([])
const policy = ref<string | null>(null)
const policyEdited = ref('')
const policyValid = ref(true)
const acl = ref<BucketAcl | null>(null)
const quota = ref<RgwQuota | null>(null)
const bucketInfo = ref<RgwBucketInfo | null>(null)
const encryption = ref<BucketEncryption | null>(null)
const bucketTags = ref<BucketTag[]>([])
const objectLock = ref<ObjectLockConfig | null>(null)

// Quota editing state
const quotaEditing = ref({
  enabled: false,
  maxSizeGB: '',
  maxObjects: '',
})

// New lifecycle rule
const newRule = ref({
  id: '',
  prefix: '',
  expirationDays: '',
  status: 'Enabled' as 'Enabled' | 'Disabled',
})
const showNewRuleForm = ref(false)

// New tag
const newTagKey = ref('')
const newTagValue = ref('')

// Encryption editing
const encryptionEditing = ref({
  algorithm: 'none' as 'none' | 'AES256' | 'aws:kms',
  kmsKeyId: '',
})

// Object Lock editing (retention settings)
const objectLockEditing = ref({
  mode: '' as '' | 'GOVERNANCE' | 'COMPLIANCE',
  days: '',
  years: '',
})

// Computed
const hasAdminCap = computed(() => store.capabilities.buckets)
const showQuotaTab = computed(() => store.hasAdminApi && store.capabilities.buckets)
const isCephBackend = computed(() => store.isCephRgw)

// Filter tabs based on backend capabilities
const visibleTabs = computed(() => {
  return tabs.filter(tab => {
    // Quota tab requires Ceph RGW with admin API
    if (tab.id === 'quota') {
      return showQuotaTab.value
    }
    // Encryption tab - hide for non-Ceph backends (most S3-compatible won't support SSE properly)
    if (tab.id === 'encryption') {
      return isCephBackend.value
    }
    return true
  })
})

// Watch for modal open/close
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    activeTab.value = 'versioning'
    // Reset permission states
    Object.keys(canEdit.value).forEach(key => {
      canEdit.value[key as TabId] = true
      permissionDenied.value[key as TabId] = false
    })
    loadAllSettings()
  }
})

// Load all settings when modal opens
async function loadAllSettings() {
  await Promise.all([
    loadVersioning(),
    loadLifecycle(),
    loadPolicy(),
    loadAcl(),
    loadQuota(),
    loadEncryption(),
    loadTags(),
    loadObjectLock(),
  ])
}

// Versioning
async function loadVersioning() {
  loading.value.versioning = true
  errors.value.versioning = null

  const result = await s3.getBucketVersioning(props.bucket)

  if (result.success && result.data) {
    versioning.value = result.data
  } else {
    const error = result.error ?? 'Failed to load versioning status'
    if (isPermissionError(error)) {
      permissionDenied.value.versioning = true
      canEdit.value.versioning = false
    }
    errors.value.versioning = error
  }

  loading.value.versioning = false
}

async function toggleVersioning() {
  if (!versioning.value || !canEdit.value.versioning) return

  const newStatus = versioning.value.status === 'Enabled' ? 'Suspended' : 'Enabled'

  saving.value.versioning = true
  errors.value.versioning = null

  const result = await s3.putBucketVersioning(props.bucket, newStatus)

  if (result.success) {
    versioning.value.status = newStatus
  } else {
    const error = result.error ?? 'Failed to update versioning'
    // If PUT fails with 403, mark as read-only
    if (isPermissionError(error)) {
      canEdit.value.versioning = false
    }
    errors.value.versioning = error
  }

  saving.value.versioning = false
}

// Lifecycle
async function loadLifecycle() {
  loading.value.lifecycle = true
  errors.value.lifecycle = null

  const result = await s3.getBucketLifecycle(props.bucket)

  if (result.success) {
    lifecycle.value = result.data ?? []
  } else {
    const error = result.error ?? 'Failed to load lifecycle rules'
    // NoSuchLifecycleConfiguration is not an error - just means no rules exist
    if (!error.toLowerCase().includes('nosuchlifecycleconfiguration')) {
      if (isPermissionError(error)) {
        permissionDenied.value.lifecycle = true
        canEdit.value.lifecycle = false
      }
      errors.value.lifecycle = error
    }
  }

  loading.value.lifecycle = false
}

async function addLifecycleRule() {
  if (!newRule.value.id || !newRule.value.expirationDays || !canEdit.value.lifecycle) return

  const rule: LifecycleRuleInfo = {
    id: newRule.value.id,
    status: newRule.value.status,
    prefix: newRule.value.prefix || undefined,
    expirationDays: parseInt(newRule.value.expirationDays),
  }

  const updatedRules = [...lifecycle.value, rule]

  saving.value.lifecycle = true
  errors.value.lifecycle = null

  const result = await s3.putBucketLifecycle(props.bucket, updatedRules)

  if (result.success) {
    lifecycle.value = updatedRules
    showNewRuleForm.value = false
    newRule.value = { id: '', prefix: '', expirationDays: '', status: 'Enabled' }
  } else {
    const error = result.error ?? 'Failed to add lifecycle rule'
    if (isPermissionError(error)) {
      canEdit.value.lifecycle = false
    }
    errors.value.lifecycle = error
  }

  saving.value.lifecycle = false
}

async function deleteLifecycleRule(ruleId: string) {
  if (!canEdit.value.lifecycle) return
  if (!confirm(`Delete lifecycle rule "${ruleId}"?`)) return

  const updatedRules = lifecycle.value.filter(r => r.id !== ruleId)

  saving.value.lifecycle = true
  errors.value.lifecycle = null

  if (updatedRules.length === 0) {
    const result = await s3.deleteBucketLifecycle(props.bucket)
    if (result.success) {
      lifecycle.value = []
    } else {
      const error = result.error ?? 'Failed to delete lifecycle rules'
      if (isPermissionError(error)) canEdit.value.lifecycle = false
      errors.value.lifecycle = error
    }
  } else {
    const result = await s3.putBucketLifecycle(props.bucket, updatedRules)
    if (result.success) {
      lifecycle.value = updatedRules
    } else {
      const error = result.error ?? 'Failed to update lifecycle rules'
      if (isPermissionError(error)) canEdit.value.lifecycle = false
      errors.value.lifecycle = error
    }
  }

  saving.value.lifecycle = false
}

// Policy
async function loadPolicy() {
  loading.value.policy = true
  errors.value.policy = null

  const result = await s3.getBucketPolicy(props.bucket)

  if (result.success) {
    policy.value = result.data ?? null
    if (result.data) {
      try {
        policyEdited.value = JSON.stringify(JSON.parse(result.data), null, 2)
      } catch {
        policyEdited.value = result.data
      }
    } else {
      policyEdited.value = ''
    }
    policyValid.value = true
  } else {
    const error = result.error ?? 'Failed to load bucket policy'
    // NoSuchBucketPolicy is not an error - just means no policy exists
    if (!error.toLowerCase().includes('nosuchbucketpolicy')) {
      if (isPermissionError(error)) {
        permissionDenied.value.policy = true
        canEdit.value.policy = false
      }
      errors.value.policy = error
    } else {
      // No policy exists - that's fine
      policy.value = null
      policyEdited.value = ''
    }
  }

  loading.value.policy = false
}

function validatePolicy() {
  if (!policyEdited.value.trim()) {
    policyValid.value = true
    return
  }

  try {
    JSON.parse(policyEdited.value)
    policyValid.value = true
  } catch {
    policyValid.value = false
  }
}

async function savePolicy() {
  if (!policyValid.value || !canEdit.value.policy) return

  saving.value.policy = true
  errors.value.policy = null

  if (!policyEdited.value.trim()) {
    // Delete policy
    const result = await s3.deleteBucketPolicy(props.bucket)
    if (result.success) {
      policy.value = null
      policyEdited.value = ''
    } else {
      const error = result.error ?? 'Failed to delete policy'
      if (isPermissionError(error)) canEdit.value.policy = false
      errors.value.policy = error
    }
  } else {
    // Update policy
    const result = await s3.putBucketPolicy(props.bucket, policyEdited.value)
    if (result.success) {
      policy.value = policyEdited.value
    } else {
      const error = result.error ?? 'Failed to save policy'
      if (isPermissionError(error)) canEdit.value.policy = false
      errors.value.policy = error
    }
  }

  saving.value.policy = false
}

// ACL
async function loadAcl() {
  loading.value.acl = true
  errors.value.acl = null

  const result = await s3.getBucketAcl(props.bucket)

  if (result.success && result.data) {
    acl.value = result.data
  } else {
    const error = result.error ?? 'Failed to load bucket ACL'
    if (isPermissionError(error)) {
      permissionDenied.value.acl = true
      canEdit.value.acl = false
    }
    errors.value.acl = error
  }

  loading.value.acl = false
}

function formatGranteeDisplay(grantee: BucketAcl['grants'][0]['grantee']): string {
  if (grantee.displayName) return grantee.displayName
  if (grantee.id) return grantee.id.substring(0, 12) + '...'
  if (grantee.uri) {
    // Format well-known URIs
    if (grantee.uri.includes('AllUsers')) return t('buckets.settings.acl.grantee_types.everyone')
    if (grantee.uri.includes('AuthenticatedUsers')) return t('buckets.settings.acl.grantee_types.authenticated')
    return grantee.uri.split('/').pop() ?? grantee.uri
  }
  return t('common.status.unknown')
}

// Quota
async function loadQuota() {
  if (!hasAdminCap.value) {
    quota.value = null
    return
  }

  loading.value.quota = true
  errors.value.quota = null

  // Get bucket info which includes quota
  const result = await admin.getBucketInfo(props.bucket)

  if (result.success && result.data) {
    bucketInfo.value = result.data
    quota.value = {
      enabled: result.data.bucketQuota?.enabled ?? false,
      maxSize: result.data.bucketQuota?.maxSize ?? -1,
      maxObjects: result.data.bucketQuota?.maxObjects ?? -1,
    }

    // Initialize editing state
    quotaEditing.value = {
      enabled: quota.value.enabled,
      maxSizeGB: quota.value.maxSize > 0 ? (quota.value.maxSize / (1024 * 1024 * 1024)).toFixed(2) : '',
      maxObjects: quota.value.maxObjects > 0 ? quota.value.maxObjects.toString() : '',
    }
  } else {
    const error = result.error ?? 'Failed to load quota settings'
    if (isPermissionError(error)) {
      permissionDenied.value.quota = true
      canEdit.value.quota = false
    }
    errors.value.quota = error
  }

  loading.value.quota = false
}

async function saveQuota() {
  if (!hasAdminCap.value || !bucketInfo.value || !canEdit.value.quota) return

  saving.value.quota = true
  errors.value.quota = null

  const maxSizeBytes = quotaEditing.value.maxSizeGB
    ? Math.floor(parseFloat(quotaEditing.value.maxSizeGB) * 1024 * 1024 * 1024)
    : -1

  const maxObjects = quotaEditing.value.maxObjects
    ? parseInt(quotaEditing.value.maxObjects)
    : -1

  const result = await admin.setBucketQuota(
    props.bucket,
    bucketInfo.value.owner,
    {
      enabled: quotaEditing.value.enabled,
      maxSize: maxSizeBytes,
      maxObjects: maxObjects,
    }
  )

  if (result.success) {
    quota.value = {
      enabled: quotaEditing.value.enabled,
      maxSize: maxSizeBytes,
      maxObjects: maxObjects,
    }
  } else {
    const error = result.error ?? 'Failed to save quota settings'
    if (isPermissionError(error)) canEdit.value.quota = false
    errors.value.quota = error
  }

  saving.value.quota = false
}

// Encryption
async function loadEncryption() {
  loading.value.encryption = true
  errors.value.encryption = null

  const result = await s3.getBucketEncryption(props.bucket)

  if (result.success) {
    encryption.value = result.data ?? null
    // Initialize editing state
    if (result.data) {
      encryptionEditing.value = {
        algorithm: result.data.sseAlgorithm,
        kmsKeyId: result.data.kmsMasterKeyId || '',
      }
    } else {
      encryptionEditing.value = { algorithm: 'none', kmsKeyId: '' }
    }
  } else {
    const error = result.error ?? 'Failed to load encryption settings'
    // ServerSideEncryptionConfigurationNotFoundError is not an error
    if (!error.toLowerCase().includes('serversideencryptionconfigurationnotfound')) {
      if (isPermissionError(error)) {
        permissionDenied.value.encryption = true
        canEdit.value.encryption = false
      }
      errors.value.encryption = error
    } else {
      // No encryption configured - that's fine
      encryption.value = null
      encryptionEditing.value = { algorithm: 'none', kmsKeyId: '' }
    }
  }

  loading.value.encryption = false
}

async function saveEncryption() {
  if (!canEdit.value.encryption) return

  saving.value.encryption = true
  errors.value.encryption = null

  if (encryptionEditing.value.algorithm === 'none') {
    // Remove encryption
    const result = await s3.deleteBucketEncryption(props.bucket)
    if (result.success) {
      encryption.value = null
    } else {
      const error = result.error ?? 'Failed to remove encryption'
      if (isPermissionError(error)) canEdit.value.encryption = false
      errors.value.encryption = error
    }
  } else {
    // Set encryption
    const result = await s3.putBucketEncryption(props.bucket, {
      sseAlgorithm: encryptionEditing.value.algorithm,
      kmsMasterKeyId: encryptionEditing.value.algorithm === 'aws:kms' ? encryptionEditing.value.kmsKeyId : undefined,
    })
    if (result.success) {
      encryption.value = {
        sseAlgorithm: encryptionEditing.value.algorithm,
        kmsMasterKeyId: encryptionEditing.value.kmsKeyId || undefined,
      }
    } else {
      const error = result.error ?? 'Failed to save encryption settings'
      if (isPermissionError(error)) canEdit.value.encryption = false
      errors.value.encryption = error
    }
  }

  saving.value.encryption = false
}

// Tags
async function loadTags() {
  loading.value.tags = true
  errors.value.tags = null

  const result = await s3.getBucketTagging(props.bucket)

  if (result.success) {
    bucketTags.value = result.data ?? []
  } else {
    const error = result.error ?? 'Failed to load tags'
    // NoSuchTagSet is not an error - just means no tags exist
    if (!error.toLowerCase().includes('nosuchtagset')) {
      if (isPermissionError(error)) {
        permissionDenied.value.tags = true
        canEdit.value.tags = false
      }
      errors.value.tags = error
    }
  }

  loading.value.tags = false
}

function addTag() {
  if (!newTagKey.value.trim() || !canEdit.value.tags) return
  if (bucketTags.value.some(t => t.key === newTagKey.value.trim())) return

  bucketTags.value.push({
    key: newTagKey.value.trim(),
    value: newTagValue.value.trim(),
  })

  newTagKey.value = ''
  newTagValue.value = ''
}

function removeTag(index: number) {
  if (!canEdit.value.tags) return
  bucketTags.value.splice(index, 1)
}

async function saveTags() {
  if (!canEdit.value.tags) return

  saving.value.tags = true
  errors.value.tags = null

  if (bucketTags.value.length === 0) {
    const result = await s3.deleteBucketTagging(props.bucket)
    if (!result.success) {
      const error = result.error ?? 'Failed to remove tags'
      if (isPermissionError(error)) canEdit.value.tags = false
      errors.value.tags = error
    }
  } else {
    const result = await s3.putBucketTagging(props.bucket, bucketTags.value)
    if (!result.success) {
      const error = result.error ?? 'Failed to save tags'
      if (isPermissionError(error)) canEdit.value.tags = false
      errors.value.tags = error
    }
  }

  saving.value.tags = false
}

// Object Lock
async function loadObjectLock() {
  loading.value.objectLock = true
  errors.value.objectLock = null

  const result = await s3.getObjectLockConfiguration(props.bucket)

  if (result.success) {
    objectLock.value = result.data ?? null
    // Initialize editing state
    if (result.data && result.data.enabled) {
      objectLockEditing.value = {
        mode: result.data.mode || '',
        days: result.data.days?.toString() || '',
        years: result.data.years?.toString() || '',
      }
    } else {
      objectLockEditing.value = { mode: '', days: '', years: '' }
    }
  } else {
    const error = result.error ?? 'Failed to load Object Lock settings'
    // ObjectLockConfigurationNotFoundError is not an error - just means not enabled
    if (!error.toLowerCase().includes('objectlockconfigurationnotfound')) {
      if (isPermissionError(error)) {
        permissionDenied.value.objectLock = true
        canEdit.value.objectLock = false
      }
      errors.value.objectLock = error
    } else {
      // Object Lock not enabled on this bucket
      objectLock.value = { enabled: false }
    }
  }

  loading.value.objectLock = false
}

async function saveObjectLockRetention() {
  if (!objectLock.value?.enabled || !canEdit.value.objectLock) return

  saving.value.objectLock = true
  errors.value.objectLock = null

  const config: ObjectLockConfig = {
    enabled: true,
    mode: objectLockEditing.value.mode as 'GOVERNANCE' | 'COMPLIANCE' | undefined,
    days: objectLockEditing.value.days ? parseInt(objectLockEditing.value.days) : undefined,
    years: objectLockEditing.value.years ? parseInt(objectLockEditing.value.years) : undefined,
  }

  const result = await s3.putObjectLockConfiguration(props.bucket, config)

  if (result.success) {
    objectLock.value = config
  } else {
    const error = result.error ?? 'Failed to save Object Lock settings'
    if (isPermissionError(error)) canEdit.value.objectLock = false
    errors.value.objectLock = error
  }

  saving.value.objectLock = false
}

function handleClose() {
  emit('update:open', false)
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 0) return 'Unlimited'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
}
</script>

<template>
  <UiModal
    :open="open"
    :title="t('buckets.settings.title', { bucket })"
    size="2xl"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex gap-6 min-h-[400px]">
      <!-- Sidebar tabs -->
      <div class="w-44 flex-shrink-0 border-r border-border-subtle pr-4">
        <nav class="space-y-1">
          <button
            v-for="tab in visibleTabs"
            :key="tab.id"
            type="button"
            :class="[
              'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all text-left',
              activeTab === tab.id
                ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            ]"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" class="w-4 h-4" />
            {{ t(tab.labelKey) }}
          </button>
        </nav>
      </div>

      <!-- Tab content -->
      <div class="flex-1 min-w-0">
        <!-- Versioning Tab -->
        <div v-if="activeTab === 'versioning'" class="space-y-4">
          <div class="flex items-center gap-2 mb-4">
            <GitBranch class="w-5 h-5 text-text-tertiary" />
            <h3 class="text-lg font-medium text-text-primary">{{ t('buckets.settings.versioning.title') }}</h3>
            <span v-if="!canEdit.versioning && !permissionDenied.versioning" class="px-2 py-0.5 text-xs bg-warning/10 text-warning rounded">
              {{ t('permissions.read_only') }}
            </span>
          </div>

          <div v-if="loading.versioning" class="flex items-center gap-2 text-text-secondary">
            <Loader2 class="w-4 h-4 animate-spin" />
            {{ t('buckets.settings.versioning.loading') }}
          </div>

          <!-- Permission denied - can't even view -->
          <div v-else-if="permissionDenied.versioning" class="p-4 bg-warning/5 border border-warning/10 rounded-lg">
            <div class="flex items-start gap-2">
              <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-warning font-medium">{{ t('permissions.permission_denied') }}</p>
                <p class="text-xs text-warning/80 mt-1">{{ t('permissions.no_view_permission') }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="errors.versioning" class="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {{ errors.versioning }}
          </div>

          <div v-else-if="versioning" class="space-y-4">
            <!-- Read-only notice -->
            <div v-if="!canEdit.versioning" class="p-3 bg-warning/5 border border-warning/10 rounded-lg">
              <div class="flex items-start gap-2">
                <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <p class="text-xs text-warning">{{ t('permissions.no_edit_permission') }}</p>
              </div>
            </div>

            <div class="p-4 bg-bg-secondary rounded-lg border border-border-subtle">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-text-primary">{{ t('buckets.settings.versioning.current_status') }}</p>
                  <p class="text-xs text-text-tertiary mt-0.5">
                    {{ versioning.status === 'Enabled' ? t('buckets.settings.versioning.enabled_description') : versioning.status === 'Suspended' ? t('buckets.settings.versioning.suspended_description') : t('buckets.settings.versioning.disabled_description') }}
                  </p>
                </div>
                <span
                  :class="[
                    'px-2 py-1 text-xs font-medium rounded-full',
                    versioning.status === 'Enabled' ? 'bg-success/10 text-success' :
                    versioning.status === 'Suspended' ? 'bg-warning/10 text-warning' :
                    'bg-bg-tertiary text-text-tertiary'
                  ]"
                >
                  {{ versioning.status === 'Enabled' ? t('common.status.enabled') : versioning.status === 'Suspended' ? t('common.status.suspended') : t('common.status.disabled') }}
                </span>
              </div>
            </div>

            <div v-if="versioning.status !== 'Disabled'" class="flex items-start gap-2 p-3 bg-warning/5 border border-warning/10 rounded-lg">
              <AlertTriangle class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <p class="text-xs text-warning">
                {{ t('buckets.settings.versioning.warning') }}
              </p>
            </div>

            <UiButton
              :variant="versioning.status === 'Enabled' ? 'secondary' : 'primary'"
              :loading="saving.versioning"
              :disabled="!canEdit.versioning"
              @click="toggleVersioning"
            >
              {{ versioning.status === 'Enabled' ? t('buckets.settings.versioning.suspend') : t('buckets.settings.versioning.enable') }}
            </UiButton>
          </div>
        </div>

        <!-- Lifecycle Tab -->
        <div v-else-if="activeTab === 'lifecycle'" class="space-y-4">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <Clock class="w-5 h-5 text-text-tertiary" />
              <h3 class="text-lg font-medium text-text-primary">{{ t('buckets.settings.lifecycle.title') }}</h3>
              <span v-if="!canEdit.lifecycle && !permissionDenied.lifecycle" class="px-2 py-0.5 text-xs bg-warning/10 text-warning rounded">
                {{ t('permissions.read_only') }}
              </span>
            </div>
            <UiButton
              v-if="!showNewRuleForm && canEdit.lifecycle"
              variant="ghost"
              size="sm"
              @click="showNewRuleForm = true"
            >
              <Plus class="w-4 h-4" />
              {{ t('buckets.settings.lifecycle.add_rule') }}
            </UiButton>
          </div>

          <div v-if="loading.lifecycle" class="flex items-center gap-2 text-text-secondary">
            <Loader2 class="w-4 h-4 animate-spin" />
            {{ t('buckets.settings.lifecycle.loading') }}
          </div>

          <!-- Permission denied - can't even view -->
          <div v-else-if="permissionDenied.lifecycle" class="p-4 bg-warning/5 border border-warning/10 rounded-lg">
            <div class="flex items-start gap-2">
              <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-warning font-medium">{{ t('permissions.permission_denied') }}</p>
                <p class="text-xs text-warning/80 mt-1">{{ t('permissions.no_view_permission') }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="errors.lifecycle" class="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {{ errors.lifecycle }}
          </div>

          <div v-else class="space-y-3">
            <!-- Read-only notice -->
            <div v-if="!canEdit.lifecycle" class="p-3 bg-warning/5 border border-warning/10 rounded-lg">
              <div class="flex items-start gap-2">
                <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <p class="text-xs text-warning">{{ t('permissions.no_edit_permission') }}</p>
              </div>
            </div>
            <!-- New rule form -->
            <div v-if="showNewRuleForm" class="p-4 bg-bg-secondary rounded-lg border border-border-default space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <UiInput
                  v-model="newRule.id"
                  :label="t('buckets.settings.lifecycle.form.rule_id_label')"
                  placeholder="my-expiration-rule"
                  monospace
                />
                <UiInput
                  v-model="newRule.prefix"
                  :label="t('buckets.settings.lifecycle.form.prefix_label')"
                  placeholder="logs/"
                  monospace
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <UiInput
                  v-model="newRule.expirationDays"
                  :label="t('buckets.settings.lifecycle.form.expiration_label')"
                  placeholder="30"
                />
                <div>
                  <label class="block text-sm font-medium text-text-primary mb-1">{{ t('buckets.settings.lifecycle.form.status_label') }}</label>
                  <select
                    v-model="newRule.status"
                    class="w-full h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50"
                  >
                    <option value="Enabled">{{ t('common.status.enabled') }}</option>
                    <option value="Disabled">{{ t('common.status.disabled') }}</option>
                  </select>
                </div>
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <UiButton variant="ghost" size="sm" @click="showNewRuleForm = false">
                  {{ t('common.actions.cancel') }}
                </UiButton>
                <UiButton
                  variant="primary"
                  size="sm"
                  :loading="saving.lifecycle"
                  :disabled="!newRule.id || !newRule.expirationDays"
                  @click="addLifecycleRule"
                >
                  {{ t('buckets.settings.lifecycle.add_rule') }}
                </UiButton>
              </div>
            </div>

            <!-- Existing rules -->
            <div v-if="lifecycle.length === 0 && !showNewRuleForm" class="text-center py-8 text-text-tertiary">
              <Clock class="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p class="text-sm">{{ t('buckets.settings.lifecycle.empty.title') }}</p>
              <p class="text-xs mt-1">{{ t('buckets.settings.lifecycle.empty.description') }}</p>
            </div>

            <div
              v-for="rule in lifecycle"
              :key="rule.id"
              class="p-3 bg-bg-secondary rounded-lg border border-border-subtle"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm text-text-primary">{{ rule.id }}</span>
                    <span
                      :class="[
                        'px-1.5 py-0.5 text-xs rounded',
                        rule.status === 'Enabled' ? 'bg-success/10 text-success' : 'bg-text-tertiary/10 text-text-tertiary'
                      ]"
                    >
                      {{ rule.status === 'Enabled' ? t('common.status.enabled') : t('common.status.disabled') }}
                    </span>
                  </div>
                  <div class="text-xs text-text-tertiary mt-1 space-y-0.5">
                    <p v-if="rule.prefix">{{ t('buckets.settings.lifecycle.rule.prefix', { prefix: rule.prefix }) }}</p>
                    <p v-if="rule.expirationDays">{{ t('buckets.settings.lifecycle.rule.expires_after', { days: rule.expirationDays }) }}</p>
                    <p v-if="rule.noncurrentVersionExpirationDays">{{ t('buckets.settings.lifecycle.rule.noncurrent_expires', { days: rule.noncurrentVersionExpirationDays }) }}</p>
                  </div>
                </div>
                <button
                  v-if="canEdit.lifecycle"
                  type="button"
                  class="p-1.5 text-text-tertiary hover:text-error transition-colors"
                  :disabled="saving.lifecycle"
                  @click="deleteLifecycleRule(rule.id)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Policy Tab -->
        <div v-else-if="activeTab === 'policy'" class="space-y-4">
          <div class="flex items-center gap-2 mb-4">
            <FileJson class="w-5 h-5 text-text-tertiary" />
            <h3 class="text-lg font-medium text-text-primary">{{ t('buckets.settings.policy.title') }}</h3>
            <span v-if="!canEdit.policy && !permissionDenied.policy" class="px-2 py-0.5 text-xs bg-warning/10 text-warning rounded">
              {{ t('permissions.read_only') }}
            </span>
          </div>

          <div v-if="loading.policy" class="flex items-center gap-2 text-text-secondary">
            <Loader2 class="w-4 h-4 animate-spin" />
            {{ t('buckets.settings.policy.loading') }}
          </div>

          <!-- Permission denied - can't even view -->
          <div v-else-if="permissionDenied.policy" class="p-4 bg-warning/5 border border-warning/10 rounded-lg">
            <div class="flex items-start gap-2">
              <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-warning font-medium">{{ t('permissions.permission_denied') }}</p>
                <p class="text-xs text-warning/80 mt-1">{{ t('permissions.no_view_permission') }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="errors.policy" class="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {{ errors.policy }}
          </div>

          <div v-else class="space-y-3">
            <!-- Read-only notice -->
            <div v-if="!canEdit.policy" class="p-3 bg-warning/5 border border-warning/10 rounded-lg">
              <div class="flex items-start gap-2">
                <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <p class="text-xs text-warning">{{ t('permissions.no_edit_permission') }}</p>
              </div>
            </div>

            <div class="relative">
              <textarea
                v-model="policyEdited"
                :disabled="!canEdit.policy"
                :class="[
                  'w-full h-64 px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 resize-none',
                  !canEdit.policy && 'opacity-60 cursor-not-allowed'
                ]"
                placeholder='{"Version": "2012-10-17", "Statement": [...]}'
                @input="validatePolicy"
              />
              <div
                v-if="!policyValid"
                class="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-error/10 rounded text-error text-xs"
              >
                <X class="w-3 h-3" />
                {{ t('buckets.settings.policy.invalid_json') }}
              </div>
            </div>

            <div class="flex items-center justify-between">
              <p class="text-xs text-text-tertiary">
                {{ policyEdited ? t('buckets.settings.policy.edit_hint') : t('buckets.settings.policy.no_policy_hint') }}
              </p>
              <UiButton
                v-if="canEdit.policy"
                variant="primary"
                size="sm"
                :loading="saving.policy"
                :disabled="!policyValid"
                @click="savePolicy"
              >
                {{ policyEdited ? t('buckets.settings.policy.save_button') : t('buckets.settings.policy.delete_button') }}
              </UiButton>
            </div>
          </div>
        </div>

        <!-- ACL Tab -->
        <div v-else-if="activeTab === 'acl'" class="space-y-4">
          <div class="flex items-center gap-2 mb-4">
            <Shield class="w-5 h-5 text-text-tertiary" />
            <h3 class="text-lg font-medium text-text-primary">{{ t('buckets.settings.acl.title') }}</h3>
          </div>

          <div v-if="loading.acl" class="flex items-center gap-2 text-text-secondary">
            <Loader2 class="w-4 h-4 animate-spin" />
            {{ t('buckets.settings.acl.loading') }}
          </div>

          <!-- Permission denied - can't even view -->
          <div v-else-if="permissionDenied.acl" class="p-4 bg-warning/5 border border-warning/10 rounded-lg">
            <div class="flex items-start gap-2">
              <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-warning font-medium">{{ t('permissions.permission_denied') }}</p>
                <p class="text-xs text-warning/80 mt-1">{{ t('permissions.no_view_permission') }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="errors.acl" class="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {{ errors.acl }}
          </div>

          <div v-else-if="acl" class="space-y-4">
            <!-- Owner -->
            <div class="p-3 bg-bg-secondary rounded-lg border border-border-subtle">
              <p class="text-xs text-text-tertiary uppercase tracking-wide mb-2">{{ t('buckets.settings.acl.owner') }}</p>
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center">
                  <span class="text-sm font-medium text-accent-primary">
                    {{ (acl.owner.displayName || acl.owner.id)[0]?.toUpperCase() }}
                  </span>
                </div>
                <div>
                  <p class="text-sm text-text-primary">{{ acl.owner.displayName || acl.owner.id }}</p>
                  <p v-if="acl.owner.displayName" class="text-xs text-text-tertiary font-mono">{{ acl.owner.id.substring(0, 16) }}...</p>
                </div>
              </div>
            </div>

            <!-- Grants -->
            <div>
              <p class="text-xs text-text-tertiary uppercase tracking-wide mb-2">{{ t('buckets.settings.acl.grants') }}</p>
              <div class="space-y-2">
                <div
                  v-for="(grant, index) in acl.grants"
                  :key="index"
                  class="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border-subtle"
                >
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded bg-bg-tertiary flex items-center justify-center">
                      <Shield class="w-3.5 h-3.5 text-text-tertiary" />
                    </div>
                    <span class="text-sm text-text-primary">
                      {{ formatGranteeDisplay(grant.grantee) }}
                    </span>
                    <span class="text-xs text-text-tertiary">({{ grant.grantee.type }})</span>
                  </div>
                  <span class="px-2 py-0.5 bg-bg-tertiary rounded text-xs font-mono text-text-secondary">
                    {{ grant.permission }}
                  </span>
                </div>
              </div>
            </div>

            <p class="text-xs text-text-tertiary">
              {{ t('buckets.settings.acl.hint') }}
            </p>
          </div>
        </div>

        <!-- Quota Tab -->
        <div v-else-if="activeTab === 'quota'" class="space-y-4">
          <div class="flex items-center gap-2 mb-4">
            <HardDrive class="w-5 h-5 text-text-tertiary" />
            <h3 class="text-lg font-medium text-text-primary">{{ t('buckets.settings.quota.title') }}</h3>
            <span v-if="!canEdit.quota && !permissionDenied.quota && hasAdminCap" class="px-2 py-0.5 text-xs bg-warning/10 text-warning rounded">
              {{ t('permissions.read_only') }}
            </span>
          </div>

          <div v-if="!hasAdminCap" class="p-4 bg-warning/5 border border-warning/10 rounded-lg">
            <div class="flex items-start gap-2">
              <AlertTriangle class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-warning font-medium">{{ t('buckets.settings.quota.admin_required') }}</p>
                <p class="text-xs text-warning/80 mt-1">
                  {{ t('buckets.settings.quota.admin_required_description') }}
                </p>
              </div>
            </div>
          </div>

          <div v-else-if="loading.quota" class="flex items-center gap-2 text-text-secondary">
            <Loader2 class="w-4 h-4 animate-spin" />
            {{ t('buckets.settings.quota.loading') }}
          </div>

          <!-- Permission denied - can't even view -->
          <div v-else-if="permissionDenied.quota" class="p-4 bg-warning/5 border border-warning/10 rounded-lg">
            <div class="flex items-start gap-2">
              <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-warning font-medium">{{ t('permissions.permission_denied') }}</p>
                <p class="text-xs text-warning/80 mt-1">{{ t('permissions.no_view_permission') }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="errors.quota" class="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {{ errors.quota }}
          </div>

          <div v-else-if="quota" class="space-y-4">
            <!-- Read-only notice -->
            <div v-if="!canEdit.quota" class="p-3 bg-warning/5 border border-warning/10 rounded-lg">
              <div class="flex items-start gap-2">
                <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <p class="text-xs text-warning">{{ t('permissions.no_edit_permission') }}</p>
              </div>
            </div>

            <!-- Current quota display -->
            <div class="p-4 bg-bg-secondary rounded-lg border border-border-subtle">
              <div class="flex items-center justify-between mb-3">
                <p class="text-sm font-medium text-text-primary">{{ t('buckets.settings.quota.current_quota') }}</p>
                <span
                  :class="[
                    'px-2 py-0.5 text-xs font-medium rounded-full',
                    quota.enabled ? 'bg-success/10 text-success' : 'bg-text-tertiary/10 text-text-tertiary'
                  ]"
                >
                  {{ quota.enabled ? t('common.status.enabled') : t('common.status.disabled') }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p class="text-text-tertiary text-xs">{{ t('buckets.settings.quota.max_size') }}</p>
                  <p class="font-mono text-text-primary">{{ formatSize(quota.maxSize) }}</p>
                </div>
                <div>
                  <p class="text-text-tertiary text-xs">{{ t('buckets.settings.quota.max_objects') }}</p>
                  <p class="font-mono text-text-primary">{{ quota.maxObjects < 0 ? t('common.labels.unlimited') : quota.maxObjects.toLocaleString() }}</p>
                </div>
              </div>
            </div>

            <!-- Edit quota (only if can edit) -->
            <div v-if="canEdit.quota" class="space-y-3">
              <UiToggle
                v-model="quotaEditing.enabled"
                :label="t('buckets.settings.quota.enable_quota')"
                :description="t('buckets.settings.quota.enable_quota_description')"
              />

              <div v-if="quotaEditing.enabled" class="grid grid-cols-2 gap-3">
                <UiInput
                  v-model="quotaEditing.maxSizeGB"
                  :label="t('buckets.settings.quota.max_size_gb_label')"
                  placeholder="10"
                  :hint="t('buckets.settings.quota.unlimited_hint')"
                />
                <UiInput
                  v-model="quotaEditing.maxObjects"
                  :label="t('buckets.settings.quota.max_objects_label')"
                  placeholder="10000"
                  :hint="t('buckets.settings.quota.unlimited_hint')"
                />
              </div>

              <UiButton
                variant="primary"
                size="sm"
                :loading="saving.quota"
                @click="saveQuota"
              >
                {{ t('buckets.settings.quota.save_button') }}
              </UiButton>
            </div>
          </div>
        </div>

        <!-- Encryption Tab -->
        <div v-else-if="activeTab === 'encryption'" class="space-y-4">
          <div class="flex items-center gap-2 mb-4">
            <Key class="w-5 h-5 text-text-tertiary" />
            <h3 class="text-lg font-medium text-text-primary">{{ t('buckets.settings.encryption.title') }}</h3>
            <span v-if="!canEdit.encryption && !permissionDenied.encryption" class="px-2 py-0.5 text-xs bg-warning/10 text-warning rounded">
              {{ t('permissions.read_only') }}
            </span>
          </div>

          <div v-if="loading.encryption" class="flex items-center gap-2 text-text-secondary">
            <Loader2 class="w-4 h-4 animate-spin" />
            {{ t('buckets.settings.encryption.loading') }}
          </div>

          <!-- Permission denied - can't even view -->
          <div v-else-if="permissionDenied.encryption" class="p-4 bg-warning/5 border border-warning/10 rounded-lg">
            <div class="flex items-start gap-2">
              <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-warning font-medium">{{ t('permissions.permission_denied') }}</p>
                <p class="text-xs text-warning/80 mt-1">{{ t('permissions.no_view_permission') }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="errors.encryption" class="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {{ errors.encryption }}
          </div>

          <div v-else class="space-y-4">
            <!-- Read-only notice -->
            <div v-if="!canEdit.encryption" class="p-3 bg-warning/5 border border-warning/10 rounded-lg">
              <div class="flex items-start gap-2">
                <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <p class="text-xs text-warning">{{ t('permissions.no_edit_permission') }}</p>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-text-primary mb-2">{{ t('buckets.settings.encryption.type_label') }}</label>
              <select
                v-model="encryptionEditing.algorithm"
                :disabled="!canEdit.encryption"
                :class="[
                  'w-full h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50',
                  !canEdit.encryption && 'opacity-60 cursor-not-allowed'
                ]"
              >
                <option value="none">{{ t('buckets.settings.encryption.none') }}</option>
                <option value="AES256">{{ t('buckets.settings.encryption.sse_s3') }}</option>
                <option value="aws:kms">{{ t('buckets.settings.encryption.sse_kms') }}</option>
              </select>
            </div>

            <div v-if="encryptionEditing.algorithm === 'aws:kms'">
              <UiInput
                v-model="encryptionEditing.kmsKeyId"
                :disabled="!canEdit.encryption"
                :label="t('buckets.settings.encryption.kms_key_label')"
                placeholder="arn:aws:kms:region:account:key/key-id"
                :hint="t('buckets.settings.encryption.kms_key_hint')"
                monospace
              />
            </div>

            <div v-if="canEdit.encryption" class="flex justify-end pt-2">
              <UiButton
                variant="primary"
                size="sm"
                :loading="saving.encryption"
                @click="saveEncryption"
              >
                {{ t('buckets.settings.encryption.save_button') }}
              </UiButton>
            </div>
          </div>
        </div>

        <!-- Tags Tab -->
        <div v-else-if="activeTab === 'tags'" class="space-y-4">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <Tag class="w-5 h-5 text-text-tertiary" />
              <h3 class="text-lg font-medium text-text-primary">{{ t('buckets.settings.tags.title') }}</h3>
              <span v-if="!canEdit.tags && !permissionDenied.tags" class="px-2 py-0.5 text-xs bg-warning/10 text-warning rounded">
                {{ t('permissions.read_only') }}
              </span>
            </div>
          </div>

          <div v-if="loading.tags" class="flex items-center gap-2 text-text-secondary">
            <Loader2 class="w-4 h-4 animate-spin" />
            {{ t('buckets.settings.tags.loading') }}
          </div>

          <!-- Permission denied - can't even view -->
          <div v-else-if="permissionDenied.tags" class="p-4 bg-warning/5 border border-warning/10 rounded-lg">
            <div class="flex items-start gap-2">
              <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-warning font-medium">{{ t('permissions.permission_denied') }}</p>
                <p class="text-xs text-warning/80 mt-1">{{ t('permissions.no_view_permission') }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="errors.tags" class="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {{ errors.tags }}
          </div>

          <div v-else class="space-y-4">
            <!-- Read-only notice -->
            <div v-if="!canEdit.tags" class="p-3 bg-warning/5 border border-warning/10 rounded-lg">
              <div class="flex items-start gap-2">
                <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <p class="text-xs text-warning">{{ t('permissions.no_edit_permission') }}</p>
              </div>
            </div>

            <!-- Existing tags -->
            <div v-if="bucketTags.length > 0" class="space-y-2">
              <div
                v-for="(tag, index) in bucketTags"
                :key="index"
                class="flex items-center gap-2 p-3 bg-bg-secondary rounded-lg"
              >
                <span class="font-mono text-sm text-text-primary">{{ tag.key }}</span>
                <span class="text-text-tertiary">=</span>
                <span class="font-mono text-sm text-text-secondary flex-1">{{ tag.value || t('common.empty') }}</span>
                <button
                  v-if="canEdit.tags"
                  type="button"
                  class="p-1.5 text-text-tertiary hover:text-error transition-colors"
                  @click="removeTag(index)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>

            <div v-else class="text-center py-6 text-text-tertiary">
              <Tag class="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p class="text-sm">{{ t('buckets.settings.tags.empty') }}</p>
            </div>

            <!-- Add new tag (only if can edit) -->
            <div v-if="canEdit.tags" class="p-3 bg-bg-secondary rounded-lg border border-border-subtle">
              <p class="text-sm text-text-secondary mb-3">{{ t('buckets.settings.tags.add_title') }}</p>
              <div class="flex items-end gap-2">
                <div class="flex-1">
                  <input
                    v-model="newTagKey"
                    type="text"
                    :placeholder="t('common.labels.key')"
                    class="w-full h-9 px-3 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary/50 font-mono"
                  />
                </div>
                <div class="flex-1">
                  <input
                    v-model="newTagValue"
                    type="text"
                    :placeholder="t('common.labels.value')"
                    class="w-full h-9 px-3 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary/50 font-mono"
                  />
                </div>
                <UiButton
                  variant="ghost"
                  size="sm"
                  :disabled="!newTagKey.trim()"
                  @click="addTag"
                >
                  <Plus class="w-4 h-4" />
                </UiButton>
              </div>
            </div>

            <div v-if="canEdit.tags" class="flex justify-end pt-2">
              <UiButton
                variant="primary"
                size="sm"
                :loading="saving.tags"
                @click="saveTags"
              >
                {{ t('buckets.settings.tags.save_button') }}
              </UiButton>
            </div>
          </div>
        </div>

        <!-- Object Lock Tab -->
        <div v-else-if="activeTab === 'objectLock'" class="space-y-4">
          <div class="flex items-center gap-2 mb-4">
            <Lock class="w-5 h-5 text-text-tertiary" />
            <h3 class="text-lg font-medium text-text-primary">{{ t('buckets.settings.object_lock.title') }}</h3>
            <span v-if="!canEdit.objectLock && !permissionDenied.objectLock" class="px-2 py-0.5 text-xs bg-warning/10 text-warning rounded">
              {{ t('permissions.read_only') }}
            </span>
          </div>

          <div v-if="loading.objectLock" class="flex items-center gap-2 text-text-secondary">
            <Loader2 class="w-4 h-4 animate-spin" />
            {{ t('buckets.settings.object_lock.loading') }}
          </div>

          <!-- Permission denied - can't even view -->
          <div v-else-if="permissionDenied.objectLock" class="p-4 bg-warning/5 border border-warning/10 rounded-lg">
            <div class="flex items-start gap-2">
              <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-warning font-medium">{{ t('permissions.permission_denied') }}</p>
                <p class="text-xs text-warning/80 mt-1">{{ t('permissions.no_view_permission') }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="errors.objectLock" class="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {{ errors.objectLock }}
          </div>

          <div v-else class="space-y-4">
            <!-- Read-only notice -->
            <div v-if="!canEdit.objectLock" class="p-3 bg-warning/5 border border-warning/10 rounded-lg">
              <div class="flex items-start gap-2">
                <Shield class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <p class="text-xs text-warning">{{ t('permissions.no_edit_permission') }}</p>
              </div>
            </div>

            <!-- Object Lock Status -->
            <div class="p-4 bg-bg-secondary rounded-lg border border-border-subtle">
              <div class="flex items-center gap-3 mb-2">
                <div
                  :class="[
                    'w-3 h-3 rounded-full',
                    objectLock?.enabled ? 'bg-success' : 'bg-text-tertiary'
                  ]"
                />
                <span class="text-sm font-medium text-text-primary">
                  {{ objectLock?.enabled ? t('buckets.settings.object_lock.enabled') : t('buckets.settings.object_lock.not_enabled') }}
                </span>
              </div>
              <p class="text-xs text-text-tertiary">
                {{ objectLock?.enabled
                  ? t('buckets.settings.object_lock.enabled_description')
                  : t('buckets.settings.object_lock.not_enabled_description') }}
              </p>
            </div>

            <!-- Retention Settings (only if Object Lock is enabled) -->
            <div v-if="objectLock?.enabled" class="space-y-4">
              <h4 class="text-sm font-medium text-text-primary">{{ t('buckets.settings.object_lock.retention_title') }}</h4>

              <div>
                <label class="block text-sm text-text-secondary mb-2">{{ t('buckets.settings.object_lock.retention_mode_label') }}</label>
                <select
                  v-model="objectLockEditing.mode"
                  :disabled="!canEdit.objectLock"
                  :class="[
                    'w-full h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50',
                    !canEdit.objectLock && 'opacity-60 cursor-not-allowed'
                  ]"
                >
                  <option value="">{{ t('buckets.settings.object_lock.no_retention') }}</option>
                  <option value="GOVERNANCE">{{ t('buckets.settings.object_lock.governance') }}</option>
                  <option value="COMPLIANCE">{{ t('buckets.settings.object_lock.compliance') }}</option>
                </select>
              </div>

              <div v-if="objectLockEditing.mode" class="grid grid-cols-2 gap-4">
                <UiInput
                  v-model="objectLockEditing.days"
                  :disabled="!canEdit.objectLock"
                  :label="t('buckets.settings.object_lock.retention_days_label')"
                  placeholder="30"
                  :hint="t('buckets.settings.object_lock.retention_days_hint')"
                />
                <UiInput
                  v-model="objectLockEditing.years"
                  :disabled="!canEdit.objectLock"
                  :label="t('buckets.settings.object_lock.retention_years_label')"
                  placeholder="1"
                  :hint="t('buckets.settings.object_lock.retention_years_hint')"
                />
              </div>

              <p v-if="objectLockEditing.mode" class="text-xs text-text-tertiary">
                {{ t('buckets.settings.object_lock.retention_hint') }}
              </p>

              <div v-if="canEdit.objectLock" class="flex justify-end pt-2">
                <UiButton
                  variant="primary"
                  size="sm"
                  :loading="saving.objectLock"
                  @click="saveObjectLockRetention"
                >
                  {{ t('buckets.settings.object_lock.save_button') }}
                </UiButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <UiButton variant="secondary" @click="handleClose">
        {{ t('common.actions.close') }}
      </UiButton>
    </template>
  </UiModal>
</template>
