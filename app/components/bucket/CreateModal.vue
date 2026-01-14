<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Database, ChevronDown, ChevronUp, MapPin, User, Lock, Shield, Tag, Plus, X } from 'lucide-vue-next'
import { useConnectionStore } from '~/stores/connection'
import { useRgwAdmin, type PlacementTarget, type RgwUserInfo } from '~/composables/useRgwAdmin'

const { t } = useI18n()

export interface BucketTag {
  key: string
  value: string
}

export interface CreateBucketOptions {
  name: string
  owner?: string
  enableVersioning: boolean
  enableObjectLock: boolean
  encryption: 'none' | 'AES256' | 'aws:kms'
  kmsKeyId?: string
  acl: 'private' | 'public-read' | 'public-read-write' | 'authenticated-read'
  placementTarget?: string
  tags: BucketTag[]
}

interface Props {
  open: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  create: [options: CreateBucketOptions]
}>()

const store = useConnectionStore()
const admin = useRgwAdmin()

const bucketName = ref('')
const touched = ref(false)
const showAdvanced = ref(false)
const enableVersioning = ref(false)
const enableObjectLock = ref(false)
const selectedEncryption = ref<'none' | 'AES256' | 'aws:kms'>('none')
const kmsKeyId = ref('')
const selectedAcl = ref<'private' | 'public-read' | 'public-read-write' | 'authenticated-read'>('private')

// Owner selection (only available with users cap)
const users = ref<RgwUserInfo[]>([])
const selectedOwner = ref('')
const loadingUsers = ref(false)

// Placement targets (only available with zone:read cap)
const placementTargets = ref<PlacementTarget[]>([])
const selectedPlacement = ref('')
const loadingPlacement = ref(false)

// Tags
const tags = ref<BucketTag[]>([])
const newTagKey = ref('')
const newTagValue = ref('')

const hasZoneCap = computed(() => store.capabilities.zone)
const hasUsersCap = computed(() => store.capabilities.users)

const aclOptions = computed(() => [
  { value: 'private', labelKey: 'buckets.create.acl.private.label', descriptionKey: 'buckets.create.acl.private.description' },
  { value: 'public-read', labelKey: 'buckets.create.acl.public_read.label', descriptionKey: 'buckets.create.acl.public_read.description' },
  { value: 'public-read-write', labelKey: 'buckets.create.acl.public_read_write.label', descriptionKey: 'buckets.create.acl.public_read_write.description' },
  { value: 'authenticated-read', labelKey: 'buckets.create.acl.authenticated_read.label', descriptionKey: 'buckets.create.acl.authenticated_read.description' },
] as const)

// Bucket name validation (S3 rules)
const validationError = computed(() => {
  if (!touched.value || !bucketName.value) return ''

  const name = bucketName.value

  if (name.length < 3) {
    return t('buckets.create.validation.min_length')
  }

  if (name.length > 63) {
    return t('buckets.create.validation.max_length')
  }

  if (!/^[a-z0-9]/.test(name)) {
    return t('buckets.create.validation.start_char')
  }

  if (!/[a-z0-9]$/.test(name)) {
    return t('buckets.create.validation.end_char')
  }

  if (/[A-Z]/.test(name)) {
    return t('buckets.create.validation.no_uppercase')
  }

  if (/[^a-z0-9.-]/.test(name)) {
    return t('buckets.create.validation.allowed_chars')
  }

  if (/\.\./.test(name)) {
    return t('buckets.create.validation.no_consecutive_periods')
  }

  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(name)) {
    return t('buckets.create.validation.no_ip_format')
  }

  return ''
})

const isValid = computed(() => {
  return bucketName.value.length >= 3 && !validationError.value
})

function handleSubmit() {
  touched.value = true

  if (!isValid.value) return

  emit('create', {
    name: bucketName.value,
    owner: selectedOwner.value || undefined,
    enableVersioning: enableVersioning.value,
    enableObjectLock: enableObjectLock.value,
    encryption: selectedEncryption.value,
    kmsKeyId: selectedEncryption.value === 'aws:kms' ? kmsKeyId.value : undefined,
    acl: selectedAcl.value,
    placementTarget: selectedPlacement.value || undefined,
    tags: tags.value,
  })
}

function handleClose() {
  emit('update:open', false)
}

// Load users for owner selection
async function loadUsers(retryCount = 0) {
  if (!hasUsersCap.value) {
    users.value = []
    return
  }

  if (!admin.isInitialized()) {
    if (retryCount < 5) {
      setTimeout(() => loadUsers(retryCount + 1), 200)
    }
    return
  }

  loadingUsers.value = true
  const listResult = await admin.listUsers()

  if (listResult.success && listResult.data) {
    const infoResult = await admin.getUsersInfo(listResult.data)
    if (infoResult.success && infoResult.data) {
      users.value = infoResult.data.sort((a, b) => a.userId.localeCompare(b.userId))
    }
  }

  loadingUsers.value = false
}

// Tag management
function addTag() {
  if (!newTagKey.value.trim()) return

  // Check for duplicate key
  if (tags.value.some(t => t.key === newTagKey.value.trim())) {
    return
  }

  tags.value.push({
    key: newTagKey.value.trim(),
    value: newTagValue.value.trim(),
  })

  newTagKey.value = ''
  newTagValue.value = ''
}

function removeTag(index: number) {
  tags.value.splice(index, 1)
}

// Load placement targets if zone cap is available
async function loadPlacementTargets(retryCount = 0) {
  if (!hasZoneCap.value) {
    placementTargets.value = []
    return
  }

  // Check if admin client is initialized
  if (!admin.isInitialized()) {
    if (retryCount < 5) {
      setTimeout(() => loadPlacementTargets(retryCount + 1), 200)
    } else {
      loadingPlacement.value = false
    }
    return
  }

  loadingPlacement.value = true
  const result = await admin.getPlacementTargets()

  if (result.success && result.data) {
    placementTargets.value = result.data
  } else {
    placementTargets.value = []
  }

  loadingPlacement.value = false
}

// Reset form when modal opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    bucketName.value = ''
    touched.value = false
    showAdvanced.value = false
    enableVersioning.value = false
    enableObjectLock.value = false
    selectedEncryption.value = 'none'
    kmsKeyId.value = ''
    selectedAcl.value = 'private'
    selectedPlacement.value = ''
    selectedOwner.value = ''
    tags.value = []
    newTagKey.value = ''
    newTagValue.value = ''
    // Load data
    loadPlacementTargets()
    loadUsers()
  }
})
</script>

<template>
  <UiModal
    :open="open"
    :title="t('buckets.create.title')"
    :description="t('buckets.create.description')"
    size="md"
    @update:open="emit('update:open', $event)"
  >
    <form @submit.prevent="handleSubmit">
      <div class="space-y-4">
        <!-- Bucket icon -->
        <div class="flex justify-center">
          <div class="w-14 h-14 rounded-xl bg-bg-secondary border border-border-subtle flex items-center justify-center">
            <Database class="w-7 h-7 text-accent-primary" :stroke-width="1.5" />
          </div>
        </div>

        <!-- Bucket name input -->
        <UiInput
          v-model="bucketName"
          :label="t('buckets.create.name_label')"
          placeholder="my-bucket-name"
          :error="validationError"
          :hint="t('buckets.create.name_hint')"
          autocomplete="off"
          monospace
          @blur="touched = true"
        />

        <!-- Advanced options toggle -->
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-2 bg-bg-secondary rounded-lg border border-border-subtle text-sm text-text-secondary hover:text-text-primary hover:border-border-default transition-colors"
          @click="showAdvanced = !showAdvanced"
        >
          <span>{{ t('buckets.create.advanced_options') }}</span>
          <component :is="showAdvanced ? ChevronUp : ChevronDown" class="w-4 h-4" />
        </button>

        <!-- Advanced options content -->
        <div v-if="showAdvanced" class="space-y-4 pt-2">
          <!-- Owner selection (only if users cap available) -->
          <div v-if="hasUsersCap">
            <label class="block text-sm font-medium text-text-primary mb-1">
              <span class="flex items-center gap-1.5">
                <User class="w-3.5 h-3.5 text-text-tertiary" />
                {{ t('buckets.create.owner.label') }}
              </span>
            </label>

            <div v-if="loadingUsers" class="h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg flex items-center text-sm text-text-tertiary">
              {{ t('buckets.create.owner.loading') }}
            </div>

            <select
              v-else-if="users.length > 0"
              v-model="selectedOwner"
              class="w-full h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50"
            >
              <option value="">{{ t('buckets.create.owner.default') }}</option>
              <option
                v-for="user in users"
                :key="user.userId"
                :value="user.userId"
              >
                {{ user.userId }}{{ user.displayName ? ` (${user.displayName})` : '' }}
              </option>
            </select>

            <div v-else class="h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg flex items-center text-sm text-text-tertiary">
              {{ t('buckets.create.owner.default') }}
            </div>

            <p class="text-xs text-text-tertiary mt-1">
              {{ t('buckets.create.owner.hint') }}
            </p>
          </div>

          <!-- Placement target (only if zone cap available) -->
          <div v-if="hasZoneCap">
            <label class="block text-sm font-medium text-text-primary mb-1">
              <span class="flex items-center gap-1.5">
                <MapPin class="w-3.5 h-3.5 text-text-tertiary" />
                {{ t('buckets.create.placement.label') }}
              </span>
            </label>

            <div v-if="loadingPlacement" class="h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg flex items-center text-sm text-text-tertiary">
              {{ t('buckets.create.placement.loading') }}
            </div>

            <select
              v-else-if="placementTargets.length > 0"
              v-model="selectedPlacement"
              class="w-full h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50"
            >
              <option value="">{{ t('buckets.create.placement.default') }}</option>
              <option
                v-for="target in placementTargets"
                :key="target.name"
                :value="target.name"
              >
                {{ target.name }}{{ target.pool ? ` (${t('buckets.create.placement.pool_suffix', { pool: target.pool })})` : '' }}
              </option>
            </select>

            <div v-else class="h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg flex items-center text-sm text-text-tertiary">
              {{ t('buckets.create.placement.no_targets') }}
            </div>

            <p class="text-xs text-text-tertiary mt-1">
              {{ placementTargets.length > 0 ? t('buckets.create.placement.hint_with_targets') : t('buckets.create.placement.hint_default') }}
            </p>
          </div>

          <!-- Versioning toggle -->
          <UiToggle
            v-model="enableVersioning"
            :label="t('buckets.create.versioning.label')"
            :description="t('buckets.create.versioning.description')"
          />

          <!-- Object Locking (WORM) -->
          <div class="p-3 bg-bg-secondary rounded-lg border border-border-subtle">
            <UiToggle
              v-model="enableObjectLock"
              :label="t('buckets.create.object_lock.label')"
              :description="t('buckets.create.object_lock.description')"
            />
            <p v-if="enableObjectLock" class="mt-2 text-xs text-warning flex items-center gap-1.5">
              <Lock class="w-3.5 h-3.5" />
              {{ t('buckets.create.object_lock.warning') }}
            </p>
          </div>

          <!-- Encryption -->
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">
              <span class="flex items-center gap-1.5">
                <Shield class="w-3.5 h-3.5 text-text-tertiary" />
                {{ t('buckets.create.encryption.label') }}
              </span>
            </label>
            <select
              v-model="selectedEncryption"
              class="w-full h-10 px-3 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50"
            >
              <option value="none">{{ t('buckets.create.encryption.none') }}</option>
              <option value="AES256">{{ t('buckets.create.encryption.sse_s3') }}</option>
              <option value="aws:kms">{{ t('buckets.create.encryption.sse_kms') }}</option>
            </select>
            <p class="text-xs text-text-tertiary mt-1">
              {{ selectedEncryption === 'none' ? t('buckets.create.encryption.none_description') : selectedEncryption === 'AES256' ? t('buckets.create.encryption.sse_s3_description') : t('buckets.create.encryption.sse_kms_description') }}
            </p>

            <!-- KMS Key ID input (only for SSE-KMS) -->
            <div v-if="selectedEncryption === 'aws:kms'" class="mt-3">
              <UiInput
                v-model="kmsKeyId"
                :label="t('buckets.create.encryption.kms_key_label')"
                placeholder="arn:aws:kms:region:account:key/key-id"
                :hint="t('buckets.create.encryption.kms_key_hint')"
                monospace
              />
            </div>
          </div>

          <!-- Tags -->
          <div>
            <label class="block text-sm font-medium text-text-primary mb-2">
              <span class="flex items-center gap-1.5">
                <Tag class="w-3.5 h-3.5 text-text-tertiary" />
                {{ t('buckets.create.tags.label') }}
              </span>
            </label>

            <!-- Existing tags -->
            <div v-if="tags.length > 0" class="space-y-2 mb-3">
              <div
                v-for="(tag, index) in tags"
                :key="index"
                class="flex items-center gap-2 p-2 bg-bg-secondary rounded-lg"
              >
                <span class="font-mono text-xs text-text-primary">{{ tag.key }}</span>
                <span class="text-text-tertiary">=</span>
                <span class="font-mono text-xs text-text-secondary flex-1">{{ tag.value || t('common.empty') }}</span>
                <button
                  type="button"
                  class="p-1 text-text-tertiary hover:text-error transition-colors"
                  @click="removeTag(index)"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Add new tag -->
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
            <p class="text-xs text-text-tertiary mt-1">
              {{ t('buckets.create.tags.hint') }}
            </p>
          </div>

          <!-- ACL selection -->
          <div>
            <label class="block text-sm font-medium text-text-primary mb-2">{{ t('buckets.create.acl.label') }}</label>
            <div class="space-y-2">
              <label
                v-for="option in aclOptions"
                :key="option.value"
                class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all"
                :class="[
                  selectedAcl === option.value
                    ? 'bg-accent-primary/5 border-accent-primary/30'
                    : 'bg-bg-secondary border-border-subtle hover:border-border-default'
                ]"
              >
                <input
                  v-model="selectedAcl"
                  type="radio"
                  :value="option.value"
                  class="mt-0.5 w-4 h-4 text-accent-primary bg-bg-primary border-border-default focus:ring-accent-primary/50"
                />
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-medium text-text-primary">{{ t(option.labelKey) }}</span>
                  <p class="text-xs text-text-tertiary mt-0.5">{{ t(option.descriptionKey) }}</p>
                </div>
              </label>
            </div>
          </div>
        </div>
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
        {{ t('buckets.create.button') }}
      </UiButton>
    </template>
  </UiModal>
</template>
