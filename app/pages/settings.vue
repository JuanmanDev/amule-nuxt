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

      <div v-if="loadingLimits" class="text-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto" />
        <p class="mt-2 text-gray-600 dark:text-gray-400">Loading settings...</p>
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

    <!-- Connection Info -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Connection Information</h2>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">External Connection Host</div>
          <div class="text-lg font-mono mt-1">{{ runtimeConfig.public.appName === 'aMule Nuxt' ? 'Configured via .env' : 'localhost' }}</div>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">External Connection Port</div>
          <div class="text-lg font-mono mt-1">4712</div>
        </div>
      </div>

      <UAlert
        icon="i-heroicons-information-circle"
        color="blue"
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

useHead({ title: 'Settings' });

const bandwidthForm = reactive({
  downloadLimit: 0,
  uploadLimit: 0
});

const loadingLimits = ref(false);
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
    toast.add({ title: 'Failed to load settings', description: e.message, color: 'red' });
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
      toast.add({ title: 'Settings saved successfully', color: 'green' });
    } else {
      toast.add({ title: 'Failed to save settings', description: result.error, color: 'red' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'red' });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadBandwidth();
});
</script>
