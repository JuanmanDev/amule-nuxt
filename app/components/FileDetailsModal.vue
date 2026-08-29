<template>
  <UModal v-model:open="open" :ui="MODAL_TRANSITION_UI" :title="title" :transition="!shared">
    <template #body>
      <div class="space-y-6">
        <div class="space-y-2">
          <!-- The row's title travels here (see useDetailsTransition) -->
          <p class="text-sm font-semibold break-all leading-snug" :style="{ viewTransitionName: shared ? ACTIVE_TRANSITION_NAME : 'none' }">{{ fileName }}</p>
          <p v-if="subtitle" class="text-xs text-gray-500 dark:text-gray-400 break-all">
            {{ subtitle }}
          </p>
        </div>

        <dl class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div v-for="fact in facts" :key="fact.label" class="min-w-0">
            <dt class="text-xs text-gray-500 dark:text-gray-400">{{ fact.label }}</dt>
            <dd class="font-medium break-words">{{ fact.value }}</dd>
          </div>
        </dl>

        <div v-if="comment">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('shared.comment') }}</div>
          <p class="text-sm break-words">{{ comment }}</p>
        </div>

        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.fileHash') }}</div>
          <div class="flex items-center gap-2">
            <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">{{ hash || $t('common.unknown') }}</code>
            <UButton
              v-if="hash"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-heroicons-clipboard-document"
              :aria-label="$t('downloads.copyHash')"
              @click="copy(hash, t('downloads.hashCopied'))"
            />
          </div>
        </div>

        <div v-if="ed2kLink">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.ed2kLink') }}</div>
          <div class="flex items-start gap-2">
            <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 max-h-24 overflow-y-auto">{{ ed2kLink }}</code>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-heroicons-clipboard-document"
              :aria-label="$t('downloads.copyLink')"
              @click="copy(ed2kLink, t('downloads.linkCopied'))"
            />
          </div>
        </div>

        <!-- A URL for this very view: paste it in another tab or send it to the
             phone and the same file opens with its details already up -->
        <div v-if="pageUrl">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('shared.pageLink') }}</div>
          <div class="flex items-center gap-2">
            <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">{{ pageUrl }}</code>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-heroicons-clipboard-document"
              :aria-label="$t('downloads.copyLink')"
              @click="copy(pageUrl, t('downloads.linkCopied'))"
            />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <!-- Only when the modal is not already on the shared page: the file's
             own home, with these details reopened there -->
        <UButton
          v-if="shareLink"
          :to="shareLink"
          color="neutral"
          variant="outline"
          icon="i-heroicons-folder-open"
          @click="() => { open = false }"
        >
          {{ $t('search.result.showInShared') }}
        </UButton>
        <UButton color="neutral" variant="ghost" @click="() => { open = false }">{{ $t('common.close') }}</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
/**
 * Everything known about one file, whichever page is asking.
 *
 * The shared page and the uploads page used to carry near-identical modals;
 * this is the one they both open. The page supplies what it knows - the facts
 * differ per page, the frame does not - and `pagePath` is the deep link that
 * reopens this exact view (see the shared page's `file` query parameter).
 */

const open = defineModel<boolean>({ default: false });

const props = defineProps<{
  title: string;
  fileName: string;
  /**
   * True while a view transition carries a row into this modal: the title
   * takes the shared name and the modal's own enter animation is switched off,
   * so the browser snapshots it in its final place.
   */
  shared?: boolean;
  /** A second line under the name: the full path, or "requested as ...". */
  subtitle?: string;
  facts: Array<{ label: string; value: string }>;
  hash?: string;
  ed2kLink?: string | null;
  comment?: string;
  /** App-relative path that reopens this file's details, e.g. /shared?file=... */
  pagePath?: string;
  /** When set, the footer offers jumping to the file on the shared page. */
  shareLink?: string;
}>();

const { t } = useI18n();
const { copy } = useClipboard();

// Absolute only in the browser: the origin is unknowable during SSR, and a
// relative URL is useless on a phone
const pageUrl = computed(() => {
  if (!props.pagePath || import.meta.server) return '';
  return `${window.location.origin}${props.pagePath}`;
});
</script>
