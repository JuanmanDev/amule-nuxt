<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold mb-2">{{ $t('settings.title') }}</h1>
      <p class="text-gray-600 dark:text-gray-400">{{ $t('settings.subtitle') }}</p>
    </div>

    <!-- Bandwidth Limits -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">{{ $t('settings.bandwidth.title') }}</h2>
      </template>

      <!-- Loading is the default state until the limits have been read -->
      <SmoothSwap>
      <div v-if="loadingLimits" key="loading" class="flex flex-wrap gap-6">
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

      <UForm v-else key="form" :state="bandwidthForm" @submit="handleSaveBandwidth"
        class="flex flex-wrap gap-6 space-y-6"
      >
        <UFormField
          :label="$t('settings.bandwidth.download')"
          :help="$t('settings.bandwidth.unlimitedHelp')"
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
          :label="$t('settings.bandwidth.upload')"
          :help="$t('settings.bandwidth.unlimitedHelp')"
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
            {{ $t('common.reset') }}
          </UButton>
          <UButton type="submit" :loading="saving" size="lg">
            <template #leading>
              <UIcon name="i-heroicons-check" />
            </template>
            {{ $t('common.save') }}
          </UButton>
        </div>
      </UForm>
      </SmoothSwap>
    </UCard>

    <!-- Appearance: the two things that cost real GPU time -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">{{ $t('settings.appearance.title') }}</h2>
      </template>

      <div class="space-y-6">
        <UFormField
          :label="$t('settings.appearance.background')"
          :help="backgroundHelp"
          name="background"
        >
          <USelect
            v-model="appearanceBackground"
            :items="BACKGROUND_MODE_OPTIONS"
            value-key="value"
            size="lg"
            class="w-full sm:w-80"
          />
        </UFormField>

        <UFormField
          :label="$t('settings.appearance.glass')"
          :help="$t('settings.appearance.glassHelp')"
          name="glass"
        >
          <USwitch v-model="appearanceGlass" size="lg" />
        </UFormField>

        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ $t('settings.appearance.storedNote') }}
        </p>
      </div>
    </UCard>

    <!-- Notifications -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">{{ $t('settings.notifications.title') }}</h2>
      </template>

      <div class="space-y-6">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ $t('settings.notifications.intro') }}
        </p>

        <div class="space-y-4">
          <UFormField
            :label="$t('settings.notifications.added')"
            :help="$t('settings.notifications.addedHelp')"
            name="notifyAdded"
          >
            <USwitch v-model="notifyAdded" size="lg" />
          </UFormField>

          <UFormField
            :label="$t('settings.notifications.completed')"
            :help="$t('settings.notifications.completedHelp')"
            name="notifyCompleted"
          >
            <USwitch v-model="notifyCompleted" size="lg" />
          </UFormField>

          <UFormField
            :label="$t('settings.notifications.system')"
            :help="$t('settings.notifications.systemHelp')"
            name="notifySystem"
          >
            <USwitch v-model="notifySystem" size="lg" />
          </UFormField>
        </div>

        <div class="border-t border-gray-200 dark:border-gray-800 pt-6 space-y-4">
          <div>
            <h3 class="font-semibold">{{ $t('settings.notifications.backgroundTitle') }}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {{ $t('settings.notifications.backgroundIntro') }}
            </p>
          </div>

          <!--
            Everything below depends on what *this browser* can do: whether the
            origin is secure, whether push exists, whether permission was
            granted, whether a subscription is already stored. The server can
            know none of it.

            Rendered client-side only, therefore. The page hydrates inside a
            Suspense boundary, so its markup is adopted *after* the capability
            check has already run - server and client disagreed about every one
            of these controls, and Vue reported the page as mismatched.

            The guard on <SmoothSwap> is separate and still needed: a transition
            whose every branch is false is an empty transition, and hydrating one
            of those throws inside Vue itself.
          -->
          <ClientOnly>
            <template #fallback>
              <USkeleton class="h-10 w-72" />
            </template>

          <SmoothSwap v-if="pushNotice">
            <UAlert
              v-if="pushNotice === 'unsupported'"
              key="unsupported"
              color="warning"
              variant="subtle"
              icon="i-heroicons-lock-closed"
              :title="$t('settings.notifications.insecureTitle')"
              :description="$t('settings.notifications.insecureDescription')"
            />

            <UAlert
              v-else
              key="denied"
              color="warning"
              variant="subtle"
              icon="i-heroicons-bell-slash"
              :title="$t('settings.notifications.deniedTitle')"
              :description="$t('settings.notifications.deniedDescription')"
            />
          </SmoothSwap>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-if="!notifications.pushEnabled.value"
              :disabled="!notifications.pushSupported.value"
              :loading="notifications.pushBusy.value"
              icon="i-heroicons-bell-alert"
              @click="enablePush"
            >
              {{ $t('settings.notifications.enable') }}
            </UButton>

            <template v-else>
              <UBadge color="success" variant="subtle" size="lg">
                <template #leading>
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
                </template>
                {{ $t('settings.notifications.subscribed') }}
              </UBadge>
              <UButton
                variant="outline"
                color="neutral"
                :loading="notifications.pushBusy.value"
                icon="i-heroicons-bell-slash"
                @click="disablePush"
              >
                {{ $t('settings.notifications.turnOff') }}
              </UButton>
            </template>

            <!-- Push has a long chain of things that fail silently; one button
                 that proves the whole path beats any amount of status text -->
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-heroicons-paper-airplane"
              :loading="testingPush"
              @click="sendTestNotification"
            >
              {{ $t('settings.notifications.sendTest') }}
            </UButton>
          </div>
          </ClientOnly>
        </div>
      </div>
    </UCard>

    <!-- Handle ed2k / magnet links from the device -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">{{ $t('settings.links.title') }}</h2>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ $t('settings.links.intro') }}
        </p>

        <SmoothSwap>
        <UAlert
          v-if="!linkHandler.isSupported.value"
          color="warning"
          variant="subtle"
          icon="i-heroicons-lock-closed"
          :title="$t('settings.links.insecureTitle')"
          :description="$t('settings.links.insecureDescription')"
        />
        </SmoothSwap>

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
            {{ $t('settings.links.scheme', { scheme }) }}
          </UButton>

          <UButton
            v-if="linkHandler.registered.value.length > 0"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-arrow-path"
            @click="linkHandler.registered.value.forEach(scheme => linkHandler.forget(scheme))"
          >
            {{ $t('settings.links.forget') }}
          </UButton>
        </div>

        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ $t('settings.links.note') }}
        </p>
      </div>
    </UCard>

    <!-- Connection Info -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">{{ $t('settings.connection.title') }}</h2>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Prefer the diagnostics values: those are what the server actually
             dials, while runtimeConfig.public holds the build-time defaults -->
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">{{ $t('settings.connection.host') }}</div>
          <div class="text-lg font-mono mt-1 break-all">
            {{ diagnostics?.amule.host || runtimeConfig.public.amuleEcHost }}
          </div>
        </div>

        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">{{ $t('settings.connection.port') }}</div>
          <div class="text-lg font-mono mt-1">
            {{ diagnostics?.amule.port || runtimeConfig.public.amuleEcPort }}
          </div>
        </div>
      </div>

      <!-- Guarded on the wrapper too: diagnostics are read in the browser, so
           during SSR this would be a transition with nothing in it -->
      <SmoothSwap v-if="diagnostics">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">{{ $t('settings.connection.appVersion') }}</div>
          <div class="text-lg font-mono mt-1">{{ diagnostics.appVersion }}</div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">{{ $t('settings.connection.serverMode') }}</div>
          <div class="text-lg font-mono mt-1">{{ diagnostics.environment }}</div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400">{{ $t('settings.connection.logLevel') }}</div>
          <div class="text-lg font-mono mt-1">
            {{ diagnostics.logLevel }}
            <span class="text-xs text-gray-500 dark:text-gray-400">({{ diagnostics.logLevelSource }})</span>
          </div>
        </div>
      </div>
      </SmoothSwap>

      <UAlert
        icon="i-heroicons-information-circle"
        color="info"
        variant="subtle"
        :title="$t('settings.connection.configTitle')"
        :description="$t('settings.connection.configDescription')"
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
const notifications = useNotifications();
const { t } = useI18n();

/**
 * Writable models over the stored preferences.
 *
 * `:model-value` with an `@update` handler looks equivalent, but the switch is a
 * reka-ui control that keeps its own state when it is not given a real model:
 * server and client then disagreed about the rendered state, and the hydration
 * mismatch that followed took the whole page's hydration down with it.
 */
function preference(key: 'added' | 'completed' | 'system') {
  return computed({
    get: () => notifications.preferences.value[key],
    set: value => notifications.setPreference(key, value)
  });
}

/** Which warning, if any, applies to background notifications on this browser. */
const pushNotice = computed<'unsupported' | 'denied' | null>(() => {
  if (notifications.checked.value && !notifications.pushSupported.value) return 'unsupported';
  if (notifications.permission.value === 'denied') return 'denied';
  return null;
});

const notifyAdded = preference('added');
const notifyCompleted = preference('completed');
const notifySystem = preference('system');

const testingPush = ref(false);

onMounted(() => notifications.hydrate());

async function enablePush() {
  const result = await notifications.enablePush();
  toast.add({
    title: result.ok ? t('settings.notifications.enabled') : t('settings.notifications.enableFailed'),
    description: result.error,
    color: result.ok ? 'success' : 'error'
  });
}

async function disablePush() {
  await notifications.disablePush();
  toast.add({ title: t('settings.notifications.disabled'), color: 'warning' });
}

async function sendTestNotification() {
  testingPush.value = true;
  try {
    const result = await $fetch<{ success: boolean; message?: string; error?: string }>('/api/push/test', {
      method: 'POST'
    });
    toast.add({
      title: result.success ? (result.message || t('settings.notifications.testSent')) : t('settings.notifications.testNothing'),
      description: result.error,
      color: result.success ? 'success' : 'warning'
    });
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  } finally {
    testingPush.value = false;
  }
}

// Both are cookie-backed, so changing them takes effect immediately and survives
// a reload without a round trip to the daemon
const { background: appearanceBackground, glass: appearanceGlass } = useAppearance();

const backgroundHelp = computed(() =>
  BACKGROUND_MODE_OPTIONS.find(option => option.value === appearanceBackground.value)?.description ?? ''
);

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
    
    // The server reads the limits back from the daemon after writing them, so
    // show what actually took effect rather than what was typed.
    if (result.data) {
      bandwidthForm.uploadLimit = result.data.uploadLimit;
      bandwidthForm.downloadLimit = result.data.downloadLimit;
    }

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
