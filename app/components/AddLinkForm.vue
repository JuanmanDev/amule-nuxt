<template>
  <UForm :state="state" @submit="submit">
    <UFormField
      :label="label"
      name="link"
      help="One ed2k:// or magnet: link per line. Paste as many as you like, in one go or a few at a time."
    >
      <div class="flex flex-col sm:flex-row gap-2">
        <!-- Same placeholder in both shapes: they accept exactly the same input,
             and only the room to show it differs -->
        <UTextarea
          v-if="multiline"
          v-model="state.link"
          :rows="3"
          autoresize
          class="flex-1"
          placeholder="ed2k://|file|name|size|hash|/ or magnet:?xt=..."
        />
        <UInput
          v-else
          v-model="state.link"
          class="flex-1"
          size="lg"
          placeholder="ed2k://|file|name|size|hash|/ or magnet:?xt=..."
          @keydown.enter.prevent="submit"
        >
          <!-- Pasting is the normal way to fill this in, so offer it while empty -->
          <template v-if="!state.link" #trailing>
            <PasteButton size="xs" variant="link" :show-label="false" @paste="onPaste" />
          </template>
        </UInput>

        <div class="flex gap-2">
          <PasteButton
            v-if="multiline && !state.link"
            size="lg"
            variant="outline"
            class="justify-center"
            @paste="onPaste"
          />
          <UButton
            type="submit"
            size="lg"
            :loading="submitting"
            :disabled="!state.link.trim()"
            icon="i-heroicons-plus"
            class="flex-1 sm:flex-none justify-center"
          >
            Add
          </UButton>
        </div>
      </div>
    </UFormField>
  </UForm>
</template>

<script setup lang="ts">
/**
 * Shared add-link form. Lives in one place so the dashboard, the downloads page
 * and the modal all validate and report the same way.
 */
import { splitLinks } from '#shared/utils/addLinks';

const props = withDefaults(defineProps<{
  label?: string;
  multiline?: boolean;
}>(), {
  label: 'Add downloads (eD2k or magnet links)',
  multiline: false
});

const emit = defineEmits<{ added: [] }>();

const route = useRoute();
const router = useRouter();
const { addLinks } = useDownloads();

const state = reactive({ link: '' });
const submitting = ref(false);

/** Appends pasted text, so pasting twice builds a batch instead of replacing. */
function onPaste(text: string) {
  state.link = state.link.trim() ? `${state.link.trimEnd()}\n${text}` : text;
}

async function submit() {
  // Shared with the batch modal: a paste is split the same way everywhere, so the
  // single line variant of this form handles a batch too
  const links = splitLinks(state.link);
  if (links.length === 0) return;

  submitting.value = true;
  try {
    const outcome = await addLinks(links);

    // Clear the field when nothing was refused; duplicates count as handled
    if (outcome.ok) {
      state.link = '';

      // Everything landed: show the user the queue they just added to
      if (outcome.summary.anyAdded) {
        emit('added');
        if (route.path !== '/downloads') {
          await router.push('/downloads');
        }
      }
    }
  } finally {
    submitting.value = false;
  }
}
</script>
