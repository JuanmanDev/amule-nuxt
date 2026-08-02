<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">Connection</h1>
        <p class="text-gray-600 dark:text-gray-400">eD2k and Kad state, server info and Kad bootstrap</p>
      </div>
      <UButton
        :loading="refreshing"
        variant="outline"
        icon="i-heroicons-arrow-path"
        @click="refresh"
      >
        Refresh
      </UButton>
    </div>

    <!-- Networks -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold">eD2k</h2>
            <USkeleton v-if="statusLoading" class="h-6 w-24" />
            <UBadge v-else :color="ed2kColor" variant="subtle">{{ ed2kLabel }}</UBadge>
          </div>
        </template>

        <dl class="space-y-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500 dark:text-gray-400">Server</dt>
            <dd class="font-medium text-right break-all">
              <USkeleton v-if="statusLoading" class="h-4 w-32" />
              <template v-else>{{ status?.serverName || 'Not connected' }}</template>
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500 dark:text-gray-400">Server address</dt>
            <dd class="font-medium font-mono text-xs">{{ status?.serverIP || '-' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500 dark:text-gray-400">Client ID</dt>
            <dd class="font-medium font-mono text-xs">{{ status?.id || '-' }}</dd>
          </div>
        </dl>

        <template #footer>
          <div class="flex flex-wrap gap-2">
            <UButton
              color="success"
              icon="i-heroicons-link"
              :loading="busy === 'ed2k-connect'"
              :disabled="statusLoading || status?.ed2kConnected"
              @click="run('ed2k-connect', () => api.connect('ed2k'))"
            >
              Connect
            </UButton>
            <UButton
              color="error"
              variant="outline"
              icon="i-heroicons-link-slash"
              :loading="busy === 'ed2k-disconnect'"
              :disabled="statusLoading || !status?.ed2kConnected"
              @click="run('ed2k-disconnect', () => api.disconnect('ed2k'))"
            >
              Disconnect
            </UButton>
            <UButton to="/servers" variant="link" trailing-icon="i-heroicons-arrow-right">
              Server list
            </UButton>
          </div>
        </template>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold">Kad</h2>
            <USkeleton v-if="statusLoading" class="h-6 w-24" />
            <UBadge v-else :color="kadColor" variant="subtle">{{ kadLabel }}</UBadge>
          </div>
        </template>

        <dl class="space-y-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500 dark:text-gray-400">Running</dt>
            <dd class="font-medium">{{ status?.kadRunning ? 'Yes' : 'No' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500 dark:text-gray-400">Firewalled</dt>
            <dd class="font-medium">{{ status?.kadFirewalled ? 'Yes' : 'No' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500 dark:text-gray-400">Kad users / files</dt>
            <dd class="font-medium">
              {{ (stats?.kadUsers ?? 0).toLocaleString() }} / {{ (stats?.kadFiles ?? 0).toLocaleString() }}
            </dd>
          </div>
        </dl>

        <template #footer>
          <div class="space-y-3">
            <div class="flex flex-wrap gap-2">
              <UButton
                color="success"
                icon="i-heroicons-play"
                :loading="busy === 'kad-start'"
                :disabled="statusLoading || status?.kadRunning"
                @click="run('kad-start', () => api.controlKad({ action: 'start' }))"
              >
                Start Kad
              </UButton>
              <UButton
                color="error"
                variant="outline"
                icon="i-heroicons-stop"
                :loading="busy === 'kad-stop'"
                :disabled="statusLoading || !status?.kadRunning"
                @click="run('kad-stop', () => api.controlKad({ action: 'stop' }))"
              >
                Stop Kad
              </UButton>
            </div>

            <UForm :state="bootstrap" class="flex flex-wrap items-end gap-2" @submit="doBootstrap">
              <UFormField label="Bootstrap from node" name="ip" class="flex-1 min-w-40">
                <UInput v-model="bootstrap.ip" placeholder="1.2.3.4" class="w-full" />
              </UFormField>
              <UFormField label="Port" name="port" class="w-28">
                <UInput v-model.number="bootstrap.port" type="number" min="1" max="65535" class="w-full" />
              </UFormField>
              <UButton
                type="submit"
                variant="outline"
                :loading="busy === 'kad-bootstrap'"
                :disabled="!bootstrap.ip.trim()"
              >
                Bootstrap
              </UButton>
            </UForm>

            <UForm :state="nodes" class="flex flex-wrap items-end gap-2" @submit="doUpdateNodes">
              <UFormField label="nodes.dat URL" name="url" class="flex-1 min-w-56">
                <UInput v-model="nodes.url" placeholder="http://upd.emule-security.org/nodes.dat" class="w-full" />
              </UFormField>
              <UButton
                type="submit"
                variant="outline"
                :loading="busy === 'kad-nodes'"
                :disabled="!nodes.url.trim()"
              >
                Update nodes
              </UButton>
            </UForm>
          </div>
        </template>
      </UCard>
    </div>

    <!-- Server message -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Server message</h2>
      </template>

      <SmoothSwap>
        <div v-if="serverInfoLoading" key="loading" class="space-y-2">
          <USkeleton v-for="n in 4" :key="n" class="h-4" :class="n % 2 ? 'w-3/4' : 'w-1/2'" />
        </div>
        <UEmpty
          v-else-if="serverInfo.length === 0"
          key="empty"
          icon="i-heroicons-chat-bubble-left-right"
          title="No server message"
          description="Connect to an eD2k server to see its message of the day."
        />
        <div v-else key="message" class="space-y-1 text-sm">
          <p v-for="(line, index) in serverInfo" :key="index" class="break-words">{{ line }}</p>
        </div>
      </SmoothSwap>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { Statistics, StatusResult } from '../../server/utils/amule-types';

const api = useAmuleApi();
const toast = useToast();

useHead({ title: 'Connection' });

const status = ref<StatusResult | null>(null);
const stats = ref<Statistics | null>(null);
const serverInfo = ref<string[]>([]);
const serverInfoLoading = ref(true);
const refreshing = ref(false);
const busy = ref<string | null>(null);

const bootstrap = reactive({ ip: '', port: 4672 });
const nodes = reactive({ url: 'http://upd.emule-security.org/nodes.dat' });

const statusLoading = computed(() => status.value === null);

const ed2kLabel = computed(() => {
  if (status.value?.ed2kConnected) return 'Connected';
  return status.value?.ed2kConnecting ? 'Connecting...' : 'Disconnected';
});
const ed2kColor = computed(() => (status.value?.ed2kConnected ? 'success' : 'neutral'));
const kadLabel = computed(() => {
  if (status.value?.kadConnected) return status.value?.kadFirewalled ? 'Connected (firewalled)' : 'Connected';
  return status.value?.kadRunning ? 'Running' : 'Stopped';
});
const kadColor = computed(() => {
  if (status.value?.kadConnected) return status.value?.kadFirewalled ? 'warning' : 'success';
  return 'neutral';
});

async function loadAll() {
  const [statusResult, statsResult, infoResult] = await Promise.all([
    api.getStatus().catch(() => null),
    api.getStatistics().catch(() => null),
    api.getServerInfo().catch(() => null)
  ]);

  if (statusResult?.success) status.value = statusResult.data ?? null;
  if (statsResult?.success) stats.value = statsResult.data ?? null;
  if (infoResult?.success) serverInfo.value = infoResult.data ?? [];
  serverInfoLoading.value = false;
}

async function refresh() {
  refreshing.value = true;
  await loadAll();
  refreshing.value = false;
}

/** Runs a command, reports the daemon's message and refreshes the state. */
async function run(key: string, action: () => Promise<{ success: boolean; message?: string; error?: string }>) {
  busy.value = key;
  try {
    const result = await action();
    toast.add({
      title: result.success ? (result.message || 'Done') : 'Command failed',
      description: result.success ? undefined : (result.error || result.message),
      color: result.success ? 'success' : 'error'
    });
    await loadAll();
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  } finally {
    busy.value = null;
  }
}

const doBootstrap = () => run('kad-bootstrap', () => api.controlKad({
  action: 'bootstrap',
  ip: bootstrap.ip.trim(),
  port: bootstrap.port
}));

const doUpdateNodes = () => run('kad-nodes', () => api.controlKad({
  action: 'update-nodes',
  url: nodes.url.trim()
}));

let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  loadAll();
  timer = setInterval(loadAll, 5000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
