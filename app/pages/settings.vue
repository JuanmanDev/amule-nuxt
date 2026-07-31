<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold mb-2">Settings</h1>
      <p class="text-gray-600 dark:text-gray-400">Configure aMule bandwidth and preferences</p>
    </div>

    <!-- Bandwidth Limits -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Bandwidth Limits</h2>
      </template>

      <!-- Loading is the default state until the limits have been read -->
      <div v-if="loadingLimits" class="flex flex-wrap gap-6">
        <div class="space-y-2">
          <USkeleton class="h-4 w-40" />
          <USkeleton class="h-10 w-56" />
        </div>
        <div class="space-y-2">
          <USkeleton class="h-4 w-40" />
          <USkeleton class="h-10 w-56" />
        </div>
        <div class="grow flex items-end justify-end gap-2">
          <USkeleton class="h-10 w-24" />
          <USkeleton class="h-10 w-36" />
        </div>
      </div>

      <UForm v-else :state="bandwidthForm" @submit="handleSaveBandwidth"
        class="flex flex-wrap gap-6 space-y-6"
      >
        <UFormField
          label="Download Limit (KB/s)"
          help="Set to 0 for unlimited"
          name="downloadLimit"
        >
          <UInput
            v-model.number="bandwidthForm.downloadLimit"
            type="number"
            min="0"
            placeholder="0"
            size="lg"
          >
            <template #trailing>
              <span class="text-gray-500 text-sm">KB/s</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Upload Limit (KB/s)"
          help="Set to 0 for unlimited"
          name="uploadLimit"
        >
          <UInput
            v-model.number="bandwidthForm.uploadLimit"
            type="number"
            min="0"
            placeholder="0"
            size="lg"
          >
            <template #trailing>
              <span class="text-gray-500 text-sm">KB/s</span>
            </template>
          </UInput>
        </UFormField>

        <div class="flex gap-2 grow items-end justify-end">
          <UButton @click="loadBandwidth" variant="outline" size="lg">
            <template #leading>
              <UIcon name="i-heroicons-arrow-path" />
            </template>
            Reset
          </UButton>
          <UButton type="submit" :loading="saving" size="lg">
            <template #leading>
              <UIcon name="i-heroicons-check" />
            </template>
            Save Changes
          </UButton>
        </div>
      </UForm>
    </UCard>

    <!-- Handle ed2k / magnet links from the device -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Open links with this app</h2>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Register this page as the handler for eD2k and magnet links, so clicking such a link
          anywhere on this device opens it here and offers to add it to the queue.
        </p>

        <UAlert
          v-if="!linkHandler.isSupported.value"
          color="warning"
          variant="subtle"
          icon="i-heroicons-lock-closed"
          title="Needs a secure origin"
          description="Browsers only allow this over https, or over http on localhost. Open the app that way to enable it."
        />

        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="scheme in (['ed2k', 'magnet'] as const)"
            :key="scheme"
            :variant="linkHandler.registered.value.includes(scheme) ? 'soft' : 'outline'"
            :color="linkHandler.registered.value.includes(scheme) ? 'success' : 'primary'"
            :disabled="!linkHandler.isSupported.value"
            :icon="linkHandler.registered.value.includes(scheme) ? 'i-heroicons-check-circle' : 'i-heroicons-link'"
            @click="linkHandler.register(scheme)"
          >
            {{ scheme }}: links
          </UButton>

          <UButton
            v-if="linkHandler.registered.value.length > 0"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-arrow-path"
            @click="linkHandler.registered.value.forEach(scheme => linkHandler.forget(scheme))"
          >
            Forget
          </UButton>
        </div>

        <p class="text-xs text-gray-500 dark:text-gray-400">
          The browser asks for confirmation the first time. Installed as an app (PWA) the same
          handlers are declared in the manifest, which also covers the operating system.
        </p>
      </div>
    </UCard>

    <!-- Connection Info -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Connection Information</h2>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">External Connection host</div>
          <div class="text-lg font-mono mt-1 break-all">{{ runtimeConfig.public.amuleEcHost }}</div>
        </div>

        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">External Connection port</div>
          <div class="text-lg font-mono mt-1">{{ runtimeConfig.public.amuleEcPort }}</div>
        </div>
      </div>

      <div v-if="diagnostics" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">App version</div>
          <div class="text-lg font-mono mt-1">{{ diagnostics.appVersion }}</div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">Server mode</div>
          <div class="text-lg font-mono mt-1">{{ diagnostics.environment }}</div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">Log level</div>
          <div class="text-lg font-mono mt-1">
            {{ diagnostics.logLevel }}
            <span class="text-xs text-gray-500 dark:text-gray-400">({{ diagnostics.logLevelSource }})</span>
          </div>
        </div>
      </div>

      <UAlert
        icon="i-heroicons-information-circle"
        color="info"
        variant="subtle"
        title="Configuration"
        description="Connection settings are configured via environment variables. See .env.example for details."
        class="mt-4"
      />
    </UCard>
  </div>
</template>

<script setup lang="ts">
const api = useAmuleApi();
const toast = useToast();
const runtimeConfig = useRuntimeConfig();
const linkHandler = useLinkHandler();

/** Shows which mode the server runs in and how verbose it logs. */
const { data: diagnosticsResponse } = await useFetch('/api/diagnostics');
const diagnostics = computed(() => diagnosticsResponse.value?.data ?? null);

useHead({ title: 'Settings' });

const bandwidthForm = reactive({
  downloadLimit: 0,
  uploadLimit: 0
});

// Start in the loading state so the inputs never flash zeroed values
const loadingLimits = ref(true);
const saving = ref(false);

async function loadBandwidth() {
  loadingLimits.value = true;
  try {
    const result = await api.getBandwidth();
    if (result.success && result.data) {
      bandwidthForm.downloadLimit = result.data.downloadLimit || 0;
      bandwidthForm.uploadLimit = result.data.uploadLimit || 0;
    }
  } catch (e: any) {
    toast.add({ title: 'Failed to load settings', description: e.message, color: 'error' });
  } finally {
    loadingLimits.value = false;
  }
}

async function handleSaveBandwidth() {
  saving.value = true;
  try {
    const result = await api.setBandwidth(
      bandwidthForm.uploadLimit,
      bandwidthForm.downloadLimit
    );
    
    if (result.success) {
      toast.add({ title: 'Settings saved successfully', color: 'success' });
    } else {
      toast.add({ title: 'Failed to save settings', description: result.error, color: 'error' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadBandwidth();
});
</script>
