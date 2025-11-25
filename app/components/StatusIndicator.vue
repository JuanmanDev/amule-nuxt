<template>
  <div>
    <!-- Connection Status Badge -->
    <div class="flex items-center gap-2">
      <UBadge
        :color="statusColor"
        :label="statusLabel"
        size="lg"
        variant="subtle"
      >
        <template #leading>
          <UIcon :name="statusIcon" class="animate-pulse" />
        </template>
      </UBadge>
      
      <!-- Quick Stats -->
      <div v-if="status" class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
        <span class="flex items-center gap-1">
          <UIcon name="i-heroicons-arrow-up" class="w-4 h-4 text-green-600" />
          {{ formatSpeed(status.uploadSpeed) }}
        </span>
        <span class="flex items-center gap-1">
          <UIcon name="i-heroicons-arrow-down" class="w-4 h-4 text-blue-600" />
          {{ formatSpeed(status.downloadSpeed) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { status, loading, error } = useAmuleStatus();

const statusColor = computed(() => {
  if (loading.value) return 'gray';
  if (error.value) return 'red';
  if (status.value?.connected) return 'green';
  return 'orange';
});

const statusLabel = computed(() => {
  if (loading.value) return 'Checking...';
  if (error.value) return 'Disconnected';
  if (status.value?.connected) return 'Connected';
  return 'Not Connected';
});

const statusIcon = computed(() => {
  if (loading.value) return 'i-heroicons-arrow-path';
  if (error.value) return 'i-heroicons-x-circle';
  if (status.value?.connected) return 'i-heroicons-check-circle';
  return 'i-heroicons-exclamation-circle';
});

function formatSpeed(kbps: number): string {
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(2)} MB/s`;
  }
  return `${kbps.toFixed(2)} KB/s`;
}
</script>
