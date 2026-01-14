<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, RefreshCw, Database, User, Users } from 'lucide-vue-next'
import { useConnectionStore } from '~/stores/connection'
import { useS3Client, type S3Bucket } from '~/composables/useS3Client'
import { useRgwAdmin } from '~/composables/useRgwAdmin'
import { useToast } from '~/stores/toast'
import type { CreateBucketOptions } from '~/components/bucket/CreateModal.vue'

const { t } = useI18n()
const toast = useToast()
const router = useRouter()
const store = useConnectionStore()
const s3 = useS3Client()
const admin = useRgwAdmin()

// View mode: 'my' for S3 ListBuckets, 'all' for Admin API
type ViewMode = 'my' | 'all'
const viewMode = ref<ViewMode>('my')

const viewModeOptions = computed(() => [
  { value: 'my', label: t('buckets.view_modes.my_buckets'), icon: User },
  { value: 'all', label: t('buckets.view_modes.all_buckets'), icon: Users },
])

// Data state
const buckets = ref<S3Bucket[]>([])
const bucketOwners = ref<Map<string, string>>(new Map())
const loading = ref(true)
const error = ref<string | null>(null)
const adminError = ref<string | null>(null)

// Modal state
const showCreateModal = ref(false)
const showDeleteModal = ref(false)
const bucketToDelete = ref<S3Bucket | null>(null)
const creating = ref(false)
const deleting = ref(false)

// Redirect to connect page if not connected
onMounted(async () => {
  if (!store.connected) {
    router.replace('/connect')
    return
  }

  await loadBuckets()
})

// Reload when view mode changes
watch(viewMode, () => {
  loadBuckets()
})

async function loadBuckets() {
  loading.value = true
  error.value = null
  adminError.value = null
  bucketOwners.value = new Map()

  if (viewMode.value === 'all') {
    await loadAllBuckets()
  } else {
    await loadMyBuckets()
  }

  loading.value = false
}

async function loadMyBuckets() {
  const result = await s3.listBuckets()

  if (result.success && result.data) {
    buckets.value = result.data.sort((a, b) => a.name.localeCompare(b.name))
  } else {
    error.value = result.error ?? 'Failed to load buckets'
  }
}

async function loadAllBuckets() {
  // First, get list of all bucket names via Admin API
  const listResult = await admin.listAllBuckets()

  if (!listResult.success || !listResult.data) {
    adminError.value = listResult.error ?? 'Failed to load buckets from Admin API'
    // Fall back to S3 API
    await loadMyBuckets()
    return
  }

  const bucketNames = listResult.data

  // Get detailed info for each bucket (includes owner)
  const infoResult = await admin.getBucketsInfo(bucketNames)

  if (infoResult.success && infoResult.data) {
    // Build bucket list with owner info
    const bucketList: S3Bucket[] = []
    const owners = new Map<string, string>()

    for (const info of infoResult.data) {
      bucketList.push({
        name: info.bucket,
        creationDate: undefined, // Admin API doesn't return creation date in list
      })
      if (info.owner) {
        owners.set(info.bucket, info.owner)
      }
    }

    buckets.value = bucketList.sort((a, b) => a.name.localeCompare(b.name))
    bucketOwners.value = owners
  } else {
    // If getting detailed info failed, just use the names
    buckets.value = bucketNames.map(name => ({
      name,
      creationDate: undefined,
    })).sort((a, b) => a.name.localeCompare(b.name))

    if (infoResult.error) {
      adminError.value = `Partial data: ${infoResult.error}`
    }
  }
}

async function handleCreateBucket(options: CreateBucketOptions) {
  creating.value = true

  // Create the bucket (pass placement target and object lock if specified)
  const result = await s3.createBucket(
    options.name,
    options.placementTarget,
    options.enableObjectLock
  )

  if (!result.success) {
    toast.error({
      title: t('buckets.create.error'),
      message: result.error,
    })
    creating.value = false
    return
  }

  // Apply versioning if enabled (or if object lock is enabled, which requires versioning)
  if (options.enableVersioning || options.enableObjectLock) {
    const versionResult = await s3.putBucketVersioning(options.name, 'Enabled')
    if (!versionResult.success) {
      console.warn('Bucket created but failed to enable versioning:', versionResult.error)
    }
  }

  // Apply ACL if not private (private is the default)
  if (options.acl !== 'private') {
    const aclResult = await s3.putBucketAcl(options.name, options.acl)
    if (!aclResult.success) {
      console.warn('Bucket created but failed to set ACL:', aclResult.error)
    }
  }

  // Apply encryption if specified
  if (options.encryption !== 'none') {
    const encResult = await s3.putBucketEncryption(options.name, {
      sseAlgorithm: options.encryption,
      kmsMasterKeyId: options.kmsKeyId,
    })
    if (!encResult.success) {
      console.warn('Bucket created but failed to set encryption:', encResult.error)
    }
  }

  // Apply tags if any
  if (options.tags && options.tags.length > 0) {
    const tagResult = await s3.putBucketTagging(options.name, options.tags)
    if (!tagResult.success) {
      console.warn('Bucket created but failed to set tags:', tagResult.error)
    }
  }

  // Link bucket to owner if specified (requires admin cap)
  if (options.owner && store.capabilities.buckets) {
    const linkResult = await admin.linkBucket(options.name, options.owner)
    if (!linkResult.success) {
      console.warn('Bucket created but failed to change owner:', linkResult.error)
    }
  }

  showCreateModal.value = false
  await loadBuckets()
  creating.value = false
}

function openDeleteModal(bucket: S3Bucket) {
  bucketToDelete.value = bucket
  showDeleteModal.value = true
}

async function handleDeleteBucket(bucket: S3Bucket) {
  deleting.value = true

  const result = await s3.deleteBucket(bucket.name)

  if (result.success) {
    showDeleteModal.value = false
    bucketToDelete.value = null
    await loadBuckets()
  } else {
    toast.error({
      title: t('buckets.delete.error'),
      message: result.error,
    })
  }

  deleting.value = false
}

function handleBrowse(bucket: S3Bucket) {
  router.push(`/browse/${bucket.name}`)
}

function handleCopyArn(bucket: S3Bucket) {
  navigator.clipboard.writeText(`arn:aws:s3:::${bucket.name}`)
}

function getOwner(bucketName: string): string | undefined {
  return bucketOwners.value.get(bucketName)
}
</script>

<template>
  <LayoutAppLayout :title="$t('buckets.title')" show-endpoint>
    <template #actions>
      <!-- View mode toggle -->
      <UiSegmentedControl
        v-model="viewMode"
        :options="viewModeOptions"
        size="sm"
      />

      <div class="w-px h-6 bg-border-subtle" />

      <UiButton
        variant="ghost"
        size="sm"
        :disabled="loading"
        @click="loadBuckets"
      >
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        {{ $t('common.actions.refresh') }}
      </UiButton>

      <UiButton
        variant="primary"
        size="sm"
        @click="showCreateModal = true"
      >
        <Plus class="w-4 h-4" />
        {{ $t('buckets.create.title') }}
      </UiButton>
    </template>

    <!-- Empty state (centered in viewport) -->
    <div
      v-if="!loading && !error && buckets.length === 0"
      class="flex items-center justify-center min-h-[calc(100vh-12rem)]"
    >
      <CommonEmptyState
        :icon="Database"
        :title="$t('buckets.empty.title')"
        :description="$t('buckets.empty.description')"
        :action-label="$t('buckets.create.title')"
        @action="showCreateModal = true"
      />
    </div>

    <!-- Content (when there are buckets or loading/error) -->
    <div v-else>
      <!-- Admin API warning/info -->
      <div
        v-if="adminError && viewMode === 'all'"
        class="mb-6 flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20"
      >
        <Users class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
        <div>
          <p class="text-sm text-warning">{{ adminError }}</p>
          <p class="text-xs text-warning/70 mt-1">{{ $t('buckets.admin_api_warning') }}</p>
        </div>
      </div>

      <!-- Error state -->
      <div
        v-if="error && !loading"
        class="bg-error/10 border border-error/20 rounded-xl p-6 text-center"
      >
        <p class="text-error mb-4">{{ error }}</p>
        <UiButton variant="secondary" @click="loadBuckets">
          {{ $t('common.actions.try_again') }}
        </UiButton>
      </div>

      <!-- Loading state -->
      <div
        v-else-if="loading"
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <BucketCardSkeleton v-for="i in 6" :key="i" />
      </div>

      <!-- Bucket grid -->
      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <BucketCard
          v-for="bucket in buckets"
          :key="bucket.name"
          :bucket="bucket"
          :owner="viewMode === 'all' ? getOwner(bucket.name) : undefined"
          @browse="handleBrowse"
          @delete="openDeleteModal"
          @copy-arn="handleCopyArn"
        />
      </div>

      <!-- Bucket count -->
      <div
        v-if="!loading && !error && buckets.length > 0"
        class="mt-6 text-center text-sm text-text-tertiary"
      >
        {{ $t('buckets.count', buckets.length) }}
        <span v-if="viewMode === 'all'" class="text-text-tertiary/70">({{ $t('common.labels.cluster_wide') }})</span>
        <span v-else class="text-text-tertiary/70">({{ $t('common.labels.owned_by_you') }})</span>
      </div>
    </div>

    <!-- Create bucket modal -->
    <BucketCreateModal
      v-model:open="showCreateModal"
      :loading="creating"
      @create="handleCreateBucket"
    />

    <!-- Delete bucket modal -->
    <BucketDeleteModal
      v-model:open="showDeleteModal"
      :bucket="bucketToDelete"
      :loading="deleting"
      @confirm="handleDeleteBucket"
    />
  </LayoutAppLayout>
</template>
