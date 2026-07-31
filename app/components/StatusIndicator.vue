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
        <NuxtLink to="/uploads" class="flex items-center gap-1 hover:underline" title="Show uploads">
          <UIcon name="i-heroicons-arrow-up" class="w-4 h-4 text-green-600" />
          {{ formatSpeed(status.uploadSpeed) }}
        </NuxtLink>
        <NuxtLink to="/downloads" class="flex items-center gap-1 hover:underline" title="Show downloads">
          <UIcon name="i-heroicons-arrow-down" class="w-4 h-4 text-blue-600" />
          {{ formatSpeed(status.downloadSpeed) }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatSpeed } from '#shared/utils/format'

const { status, loading, error } = useAmuleStatus();

const statusColor = computed(() => {
  if (loading.value) return 'neutral';
  if (error.value) return 'error';
  if (status.value?.connected) return 'success';
  return 'warning';
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

</script>
