<script setup lang="ts">
</script>

<template>
  <div class="bg-bg-secondary border border-border-subtle rounded-xl p-4">
    <!-- Header -->
    <div class="flex items-start gap-3">
      <UiSkeleton variant="rectangular" width="40px" height="40px" class="rounded-lg" />

      <div class="flex-1 min-w-0 space-y-2">
        <UiSkeleton variant="text" width="60%" />
        <UiSkeleton variant="text" width="40%" height="0.75rem" />
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-4 pt-3 border-t border-border-subtle">
      <UiSkeleton variant="text" width="30%" height="0.75rem" />
    </div>
  </div>
</template>
