<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold mb-2">Dashboard</h1>
      <p class="text-gray-600 dark:text-gray-400">Overview of your aMule daemon status and activity</p>
    </div>

    <!-- Connection Status Indicator (WebSocket) -->
    <div v-if="!wsStatus.connected" class="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg flex items-center justify-between">
      <div class="flex items-center gap-2">
         <UIcon name="i-heroicons-wifi" class="w-5 h-5 animate-pulse" />
         <span>Connecting to real-time updates...</span>
      </div>
      <div v-if="wsStatus.error" class="text-sm">
         {{ wsStatus.error }}
      </div>
    </div>

    <!-- Connection Management -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Connection</h2>
          <div class="flex gap-2">
            <UButton
              @click="handleConnect"
              :loading="connecting"
              :disabled="effectiveStatus?.connected"
              color="green"
              icon="i-heroicons-link"
            >
              Connect
            </UButton>
            <UButton
              @click="handleDisconnect"
              :loading="disconnecting"
              :disabled="!effectiveStatus?.connected"
              color="red"
              variant="outline"
              icon="i-heroicons-link-slash"
            >
              Disconnect
            </UButton>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="  ">
          <div class="text-sm text-gray-600 dark:text-gray-400">eD2k</div>
          <div class="text-lg font-semibold mt-1">
            <UBadge :color="effectiveStatus?.ed2kConnected ? 'green' : 'gray'">
              {{ effectiveStatus?.ed2kConnected ? 'Connected' : 'Disconnected' }}
            </UBadge>
          </div>
          <div v-if="effectiveStatus?.serverName" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {{ effectiveStatus.serverName }}
          </div>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg flex justify-between md:block">
          <div class="text-sm text-gray-600 dark:text-gray-400">Kad</div>
          <div class="text-lg font-semibold mt-1">
            <UBadge :color="effectiveStatus?.kadConnected ? 'green' : 'gray'">
              {{ effectiveStatus?.kadConnected ? 'Connected' : 'Disconnected' }}
            </UBadge>
          </div>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg flex justify-between md:block">
          <div class="text-sm text-gray-600 dark:text-gray-400">Client ID</div>
          <div class="text-lg font-semibold mt-1 font-mono">
            {{ effectiveStatus?.id || 'N/A' }}
          </div>
        </div>
      </div>
    </UCard>

    <!-- Quick Statistics -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Current Activity</h2>
      </template>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <UIcon name="i-heroicons-arrow-up" class="w-4 h-4" />
            Upload Speed
          </div>
          <div class="text-2xl font-bold mt-2 text-green-600">
            {{ formatSpeed(effectiveStatus?.uploadSpeed || 0) }}
          </div>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <UIcon name="i-heroicons-arrow-down" class="w-4 h-4" />
            Download Speed
          </div>
          <div class="text-2xl font-bold mt-2 text-blue-600">
            {{ formatSpeed(effectiveStatus?.downloadSpeed || 0) }}
          </div>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <UIcon name="i-heroicons-users" class="w-4 h-4" />
            Queued Clients
          </div>
          <div class="text-2xl font-bold mt-2">
            {{ effectiveStatus?.queuedClients || 0 }}
          </div>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <UIcon name="i-heroicons-globe-alt" class="w-4 h-4" />
            Total Sources
          </div>
          <div class="text-2xl font-bold mt-2">
            {{ effectiveStatus?.totalSourceCount || 0 }}
          </div>
        </div>
      </div>
    </UCard>

    <!-- Quick Actions -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Quick Actions</h2>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NuxtLink to="/downloads">
          <UButton block size="lg" variant="outline">
            <template #leading>
              <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5" />
            </template>
            Manage Downloads
          </UButton>
        </NuxtLink>

        <NuxtLink to="/search">
          <UButton block size="lg" variant="outline">
            <template #leading>
              <UIcon name="i-heroicons-magnifying-glass" class="w-5 h-5" />
            </template>
            Search Files
          </UButton>
        </NuxtLink>

        <NuxtLink to="/settings">
          <UButton block size="lg" variant="outline">
            <template #leading>
              <UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5" />
            </template>
            Settings
          </UButton>
        </NuxtLink>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAmuleSocket } from '~/composables/useAmuleSocket';

const api = useAmuleApi();
const toast = useToast();
const { status } = useAmuleStatus(); // Keep fallback to polling if WS fails initially?
const { wsStatus, realtimeStatus } = useAmuleSocket();

// Prioritize real-time status if available
const effectiveStatus = computed(() => {
  if (wsStatus.value.connected && realtimeStatus.value) {
    return realtimeStatus.value;
  }
  return status.value;
});

const connecting = ref(false);
const disconnecting = ref(false);

useHead({ title: 'Dashboard' });

async function handleConnect() {
  connecting.value = true;
  try {
    const result = await api.connect();
    if (result.success) {
      toast.add({ title: 'Connected successfully', color: 'success' });
    } else {
      toast.add({ title: 'Connection failed', description: result.error, color: 'error' });
    }
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.message, color: 'error' });
  } finally {
    connecting.value = false;
  }
}

async function handleDisconnect() {
  disconnecting.value = true;
  try {
    const result = await api.disconnect();
    if (result.success) {
      toast.add({ title: 'Disconnected successfully', color: 'warning' });
    } else {
      toast.add({ title: 'Disconnect failed', description: result.error, color: 'error' });
    }
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.message, color: 'error' });
  } finally {
    disconnecting.value = false;
  }
}

function formatSpeed(kbps: number): string {
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(2)} MB/s`;
  }
  return `${kbps.toFixed(2)} KB/s`;
}
</script>
