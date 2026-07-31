<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-3xl font-bold mb-1">Add this link?</h1>
      <p class="text-gray-600 dark:text-gray-400">
        Opened from a {{ scheme }}: link on this device.
      </p>
    </div>

    <UAlert
      v-if="!link"
      color="warning"
      variant="subtle"
      icon="i-heroicons-exclamation-triangle"
      title="No link received"
      description="The handler was opened without a link. Paste one on the downloads page instead."
      :actions="[{ label: 'Open downloads', to: '/downloads', variant: 'outline' }]"
    />

    <template v-else>
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl font-semibold">Link</h2>
            <UBadge :color="validation.valid ? 'success' : 'error'" variant="subtle">
              {{ validation.valid ? 'Looks valid' : 'Invalid link' }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-3">
          <div v-if="fileName">
            <div class="text-xs text-gray-500 dark:text-gray-400">File name</div>
            <p class="text-sm font-medium break-all">{{ fileName }}</p>
          </div>

          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Full link</div>
            <code class="block text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 max-h-32 overflow-y-auto">{{ link }}</code>
          </div>

          <UAlert
            v-if="!validation.valid"
            color="error"
            variant="subtle"
            icon="i-heroicons-x-circle"
            :description="validation.error"
          />
        </div>

        <template #footer>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton color="neutral" variant="ghost" to="/downloads">Cancel</UButton>
            <UButton
              :loading="adding"
              :disabled="!validation.valid"
              icon="i-heroicons-plus"
              @click="add"
            >
              Add to aMule
            </UButton>
          </div>
        </template>
      </UCard>

      <p class="text-xs text-gray-500 dark:text-gray-400">
        Tip: enable "always allow" in the browser prompt to skip the confirmation next time,
        or manage the handler on the <NuxtLink to="/settings" class="underline">settings page</NuxtLink>.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Target of the registered ed2k:/magnet: protocol handler.
 *
 * The link is shown for confirmation before anything is queued: the page is
 * reachable by any link on the device, so it must not add silently.
 */
import { validateDownloadLink } from '../../server/utils/amule-ec/links';

const route = useRoute();
const router = useRouter();
const { addLinks } = useDownloads();

useHead({ title: 'Add link' });

const adding = ref(false);

const scheme = computed(() => String(route.query.scheme ?? 'ed2k'));

/** The browser substitutes %s with the percent-encoded link. */
const link = computed(() => {
  const raw = route.query.link;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '';

  try {
    return decodeURIComponent(String(value)).trim();
  } catch {
    return String(value).trim();
  }
});

const validation = computed(() => validateDownloadLink(link.value));

const fileName = computed(() => {
  const parts = link.value.split('|');
  return parts[1] === 'file' ? parts[2] : undefined;
});

async function add() {
  adding.value = true;
  try {
    const outcome = await addLinks(link.value);
    if (outcome.ok) router.push('/downloads');
  } finally {
    adding.value = false;
  }
}
</script>
