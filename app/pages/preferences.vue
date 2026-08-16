<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">aMule preferences</h1>
        <p class="text-gray-600 dark:text-gray-400">Nickname, limits and directories as configured in the daemon</p>
      </div>
      <UButton
        :loading="refreshing"
        :disabled="loading"
        variant="outline"
        icon="i-heroicons-arrow-path"
        @click="refresh"
      >
        Refresh
      </UButton>
    </div>

    <!-- Loading is the default state until the daemon answered -->
    <SmoothSwap>
    <div v-if="loading" key="loading" class="space-y-6">
      <UCard v-for="n in 3" :key="n">
        <template #header>
          <USkeleton class="h-6 w-40" />
        </template>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <USkeleton v-for="row in 4" :key="row" class="h-10 w-full" />
        </div>
      </UCard>
    </div>

    <UAlert
      v-else-if="error"
        key="error"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      title="Failed to read preferences"
      :description="error"
      :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <div v-else-if="prefs" key="prefs" class="space-y-6">
      <!-- Identity -->
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">Identity</h2>
        </template>

        <UForm :state="identityForm" class="space-y-4" @submit="saveNickname">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField label="Nickname" name="nickname" help="Shown to other clients">
              <UInput v-model="identityForm.nickname" class="w-full" />
            </UFormField>

            <UFormField label="User hash" name="userHash" help="Identifies this client, cannot be changed here">
              <UInput :model-value="prefs.userHash" readonly class="w-full font-mono text-xs" />
            </UFormField>
          </div>

          <UButton
            type="submit"
            :loading="saving === 'nickname'"
            :disabled="identityForm.nickname.trim() === prefs.nickname || !identityForm.nickname.trim()"
            icon="i-heroicons-check"
          >
            Save nickname
          </UButton>
        </UForm>
      </UCard>

      <!-- Limits -->
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">Limits</h2>
        </template>

        <UForm :state="connectionForm" class="space-y-4" @submit="saveConnection">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <UFormField label="Upload limit (KB/s)" name="maxUpload" help="0 = unlimited">
              <UInput v-model.number="connectionForm.maxUpload" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Download limit (KB/s)" name="maxDownload" help="0 = unlimited">
              <UInput v-model.number="connectionForm.maxDownload" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Max connections" name="maxConnections">
              <UInput v-model.number="connectionForm.maxConnections" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Max sources per file" name="maxSourcesPerFile">
              <UInput v-model.number="connectionForm.maxSourcesPerFile" type="number" min="0" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div class="text-xs text-gray-500 dark:text-gray-400">TCP port</div>
              <div class="font-medium font-mono">{{ prefs.connection.tcpPort }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500 dark:text-gray-400">UDP port</div>
              <div class="font-medium font-mono">{{ prefs.connection.udpPort }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Line capacity up / down</div>
              <div class="font-medium">
                {{ prefs.connection.uploadCapacity }} / {{ prefs.connection.downloadCapacity }} KB/s
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Auto connect / reconnect</div>
              <div class="font-medium">
                {{ prefs.connection.autoConnect ? 'Yes' : 'No' }} / {{ prefs.connection.reconnect ? 'Yes' : 'No' }}
              </div>
            </div>
          </div>

          <UButton type="submit" :loading="saving === 'connection'" icon="i-heroicons-check">
            Save limits
          </UButton>
        </UForm>
      </UCard>

      <!-- Directories -->
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">Directories</h2>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
            <div class="text-xs text-gray-500 dark:text-gray-400">Incoming</div>
            <div class="font-mono mt-1 break-all">{{ prefs.directories.incoming || '-' }}</div>
          </div>
          <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
            <div class="text-xs text-gray-500 dark:text-gray-400">Temp</div>
            <div class="font-mono mt-1 break-all">{{ prefs.directories.temp || '-' }}</div>
          </div>
          <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
            <div class="text-xs text-gray-500 dark:text-gray-400">Share hidden files</div>
            <div class="mt-1">{{ prefs.directories.shareHidden ? 'Yes' : 'No' }}</div>
          </div>
          <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
            <div class="text-xs text-gray-500 dark:text-gray-400">Rescan shared directories</div>
            <div class="mt-1">{{ prefs.directories.autoRescan ? 'Yes' : 'No' }}</div>
          </div>
        </div>

        <template #footer>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Directories are set in the daemon's amule.conf; aMule does not allow changing them over the
            External Connection interface.
          </p>
        </template>
      </UCard>

      <UAlert
        icon="i-heroicons-information-circle"
        color="info"
        variant="subtle"
        title="Server list settings"
        description="Options for updating and cleaning the server list live on the Servers page."
        :actions="[{ label: 'Open servers', to: '/servers', color: 'info', variant: 'outline' }]"
      />
    </div>
    </SmoothSwap>

    <RelatedPages :pages="['settings', 'connection', 'servers']" />
  </div>
</template>

<script setup lang="ts">
import type { AmulePreferences } from '../../server/utils/amule-types';

const api = useAmuleApi();
const toast = useToast();

useHead({ title: 'Preferences' });

const prefs = ref<AmulePreferences | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const refreshing = ref(false);
const saving = ref<string | null>(null);

const identityForm = reactive({ nickname: '' });
const connectionForm = reactive({
  maxUpload: 0,
  maxDownload: 0,
  maxConnections: 0,
  maxSourcesPerFile: 0
});

function applyToForms(values: AmulePreferences) {
  identityForm.nickname = values.nickname;
  connectionForm.maxUpload = values.connection.maxUpload;
  connectionForm.maxDownload = values.connection.maxDownload;
  connectionForm.maxConnections = values.connection.maxConnections;
  connectionForm.maxSourcesPerFile = values.connection.maxSourcesPerFile;
}

async function fetchPreferences({ silent = false }: { silent?: boolean } = {}) {
  if (!silent) loading.value = !prefs.value;
  error.value = null;

  try {
    const result = await api.getPreferences();
    if (result.success && result.data) {
      prefs.value = result.data;
      applyToForms(result.data);
    } else {
      error.value = result.error || 'Failed to read preferences';
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to read preferences';
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  await fetchPreferences({ silent: true });
  refreshing.value = false;
}

async function save(key: string, body: Record<string, unknown>) {
  saving.value = key;
  try {
    const result = await api.setPreferences(body);
    toast.add({
      title: result.success ? (result.message || 'Preferences saved') : 'Could not save',
      description: result.success ? undefined : result.error,
      color: result.success ? 'success' : 'error'
    });
    if (result.success) await fetchPreferences({ silent: true });
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  } finally {
    saving.value = null;
  }
}

const saveNickname = () => save('nickname', { nickname: identityForm.nickname.trim() });
const saveConnection = () => save('connection', { connection: { ...connectionForm } });

onMounted(() => {
  fetchPreferences();
});
</script>
