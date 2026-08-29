<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">{{ $t('assistant.title') }}</h1>
        <p class="text-gray-600 dark:text-gray-400">{{ $t('assistant.subtitle') }}</p>
      </div>
      <UButton
        v-if="messages.length > 0"
        variant="outline"
        color="neutral"
        icon="i-heroicons-trash"
        @click="clear"
      >
        {{ $t('assistant.clear') }}
      </UButton>
    </div>

    <!-- Nothing is claimed until the browser has actually been asked, and only
         the in-browser provider needs WebGPU at all -->
    <!-- In the static demo the model can run, but the tools it would call live
         on the server this demo does not have -->
    <UAlert
      v-if="isDemo"
      color="warning"
      variant="subtle"
      icon="i-heroicons-exclamation-triangle"
      :title="$t('demo.mcpUnavailableTitle')"
      :description="$t('demo.mcpUnavailable')"
    />

    <SmoothSwap>
      <UAlert
        v-if="checked && !supported && provider === 'webllm'"
        key="unsupported"
        color="warning"
        variant="subtle"
        icon="i-heroicons-cpu-chip"
        :title="$t('assistant.unsupportedTitle')"
        :description="$t('assistant.unsupportedDescription')"
      />
    </SmoothSwap>

    <!-- Model picker: only until one is running -->
    <UCard v-if="status !== 'ready' && status !== 'thinking'">
      <div class="space-y-4">
        <!-- Where the model runs: in this browser, or behind an endpoint -->
        <UFormField :label="$t('assistant.providerLabel')">
          <div class="flex items-center gap-1">
            <UButton
              v-for="option in providerOptions"
              :key="option.value"
              :color="provider === option.value ? 'primary' : 'neutral'"
              :variant="provider === option.value ? 'soft' : 'outline'"
              :aria-pressed="provider === option.value"
              @click="provider = option.value"
            >
              {{ option.label }}
            </UButton>
          </div>
        </UFormField>

        <template v-if="provider === 'webllm'">
          <div class="flex flex-col sm:flex-row sm:items-end gap-3">
            <UFormField :label="$t('assistant.model')" name="model" class="flex-1 min-w-0">
              <USelect
                v-model="modelId"
                :items="modelItems"
                value-key="value"
                label-key="label"
                size="lg"
                class="w-full"
                :disabled="status === 'loading' || !supported"
              />
            </UFormField>
            <UButton
              size="lg"
              icon="i-heroicons-sparkles"
              :loading="status === 'loading'"
              :disabled="!modelId || !supported"
              @click="load"
            >
              {{ $t('assistant.loadModel') }}
            </UButton>
          </div>

          <div v-if="status === 'loading'" class="space-y-2">
            <UProgress :model-value="progress" :min="0" :max="100" />
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ $t('assistant.loading', { percent: progress }) }}
              <span v-if="progressText"> · {{ progressText }}</span>
            </p>
          </div>

          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ $t('assistant.downloadNote') }}
          </p>
        </template>

        <template v-else>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="$t('assistant.api.baseUrlLabel')" :help="$t('assistant.api.baseUrlHelp')">
              <UInput
                v-model="api.baseUrl"
                size="lg"
                class="w-full"
                placeholder="http://localhost:11434/v1"
                spellcheck="false"
              />
            </UFormField>
            <UFormField :label="$t('assistant.api.keyLabel')" :help="$t('assistant.api.keyHelp')">
              <UInput
                v-model="api.apiKey"
                size="lg"
                class="w-full"
                type="password"
                autocomplete="off"
                :placeholder="$t('assistant.api.keyPlaceholder')"
              />
            </UFormField>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-end gap-3">
            <UFormField :label="$t('assistant.api.modelLabel')" class="flex-1 min-w-0">
              <USelect
                v-if="apiModels.length > 0"
                v-model="api.model"
                :items="apiModels"
                size="lg"
                class="w-full"
              />
              <UInput
                v-else
                v-model="api.model"
                size="lg"
                class="w-full"
                :placeholder="$t('assistant.api.modelPlaceholder')"
                spellcheck="false"
              />
            </UFormField>
            <UButton
              size="lg"
              variant="outline"
              color="neutral"
              icon="i-heroicons-list-bullet"
              :disabled="!api.baseUrl.trim()"
              @click="listApiModels"
            >
              {{ $t('assistant.api.listModels') }}
            </UButton>
            <UButton
              size="lg"
              icon="i-heroicons-bolt"
              :loading="status === 'loading'"
              :disabled="!api.baseUrl.trim() || !api.model.trim()"
              @click="load"
            >
              {{ $t('assistant.api.connect') }}
            </UButton>
          </div>

          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ $t('assistant.api.note') }}
          </p>
        </template>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-heroicons-exclamation-circle"
          :description="error"
        />
      </div>
    </UCard>

    <!-- Conversation -->
    <UCard v-if="status === 'ready' || status === 'thinking' || messages.length > 0">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <UBadge :color="status === 'thinking' ? 'info' : 'success'" variant="subtle">
              {{ status === 'thinking' ? $t('assistant.thinking') : $t('assistant.ready') }}
            </UBadge>
            <span class="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">{{ activeModelLabel }}</span>
            <UButton
              v-if="status === 'ready'"
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-heroicons-arrow-uturn-left"
              :aria-label="$t('assistant.changeModel')"
              @click="disconnect"
            >
              <span class="hidden sm:inline">{{ $t('assistant.changeModel') }}</span>
            </UButton>
          </div>
          <UPopover v-if="tools.length > 0">
            <UButton variant="ghost" color="neutral" size="xs" icon="i-heroicons-wrench-screwdriver">
              {{ tools.length }}
            </UButton>
            <template #content>
              <div class="p-3 max-w-sm max-h-80 overflow-y-auto space-y-2">
                <p class="text-xs font-semibold">{{ $t('assistant.toolsTitle') }}</p>
                <div v-for="tool in tools" :key="tool.name" class="text-xs">
                  <code class="font-mono">{{ tool.name }}</code>
                  <p class="text-gray-500 dark:text-gray-400">{{ tool.description }}</p>
                </div>
              </div>
            </template>
          </UPopover>
        </div>
      </template>

      <div class="space-y-4 max-h-[55vh] overflow-y-auto pr-1" ref="transcriptEl">
        <UEmpty
          v-if="messages.length === 0"
          icon="i-heroicons-chat-bubble-left-right"
          :title="$t('assistant.emptyTitle')"
          :description="$t('assistant.emptyDescription')"
        />

        <div v-for="(message, index) in messages" :key="index">
          <!-- A tool call is shown as what it is: a step, not something anyone said -->
          <div
            v-if="message.role === 'tool'"
            class="text-xs rounded-lg border px-3 py-2"
            :class="message.failed
              ? 'border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
              : 'border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400'"
          >
            <details>
              <summary class="cursor-pointer flex items-center gap-1">
                <UIcon name="i-heroicons-wrench-screwdriver" class="w-3.5 h-3.5" />
                {{ $t('assistant.toolCall', { tool: message.toolName }) }}
              </summary>
              <pre class="mt-2 whitespace-pre-wrap break-words font-mono">{{ message.toolArgs }}
{{ message.content }}</pre>
            </details>
          </div>

          <div
            v-else
            class="rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words"
            :class="message.role === 'user'
              ? 'bg-primary-50 dark:bg-primary-950/40 ms-8'
              : 'bg-elevated/60 me-8'"
          >
            {{ message.content }}
          </div>
        </div>
      </div>

      <template #footer>
        <form class="flex items-end gap-2 w-full" @submit.prevent="send">
          <UTextarea
            v-model="draft"
            :rows="1"
            :maxrows="5"
            autoresize
            :placeholder="$t('assistant.placeholder')"
            class="flex-1 min-w-0"
            :disabled="status === 'thinking'"
            @keydown.enter.exact.prevent="send"
          />
          <UButton
            v-if="status === 'thinking'"
            color="neutral"
            variant="outline"
            icon="i-heroicons-stop"
            @click="stop"
          >
            {{ $t('assistant.stop') }}
          </UButton>
          <UButton
            v-else
            type="submit"
            icon="i-heroicons-paper-airplane"
            :disabled="!draft.trim()"
          >
            {{ $t('assistant.send') }}
          </UButton>
        </form>
      </template>
    </UCard>

    <UAlert
      v-if="error && status !== 'loading'"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      :title="$t('assistant.failed')"
      :description="error"
    />

    <RelatedPages :pages="['mcpServer', 'search', 'downloads']" />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
useHead({ title: () => t('assistant.title') });
const isDemo = Boolean(useRuntimeConfig().public.demo);

const {
  messages,
  models,
  modelId,
  provider,
  api,
  apiModels,
  listApiModels,
  disconnect,
  status,
  progress,
  progressText,
  error,
  supported,
  checked,
  tools,
  detect,
  load,
  ask,
  stop,
  clear
} = useLocalAssistant();

const providerOptions = computed(() => [
  { label: t('assistant.providers.webllm'), value: 'webllm' as const },
  { label: t('assistant.providers.api'), value: 'api' as const }
]);

/** What the header names: the browser model, or the endpoint's model and host. */
const activeModelLabel = computed(() => {
  if (provider.value !== 'api') return modelId.value;
  try {
    return `${api.value.model} @ ${new URL(api.value.baseUrl).host}`;
  } catch {
    return api.value.model;
  }
});

const draft = ref('');
const transcriptEl = ref<HTMLElement | null>(null);

// WebGPU can only be asked about in a browser, and only after mount, so the
// server-rendered page and the first client render agree
onMounted(detect);

const modelItems = computed(() => models.value.map(model => ({
  // The size is the thing people decide on: it is a download, once, over their
  // own connection
  label: model.vramMb
    ? `${model.id} (${(model.vramMb / 1024).toFixed(1)} GB)`
    : model.id,
  value: model.id
})));

async function send() {
  const question = draft.value;
  if (!question.trim()) return;

  draft.value = '';
  await nextTick();
  scrollToEnd();

  await ask(question);
  await nextTick();
  scrollToEnd();
}

function scrollToEnd() {
  const element = transcriptEl.value;
  if (element) element.scrollTop = element.scrollHeight;
}

// Tool steps arrive one at a time during a turn; follow them
watch(() => messages.value.length, () => nextTick(scrollToEnd));
</script>
