<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">MCP server</h1>
        <p class="text-gray-600 dark:text-gray-400">
          This app exposes its aMule features as Model Context Protocol tools, so an AI agent can drive
          the daemon the same way the pages do.
        </p>
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

    <!-- Loading is the default state until the endpoint answered -->
    <div v-if="loading" class="space-y-4">
      <USkeleton class="h-28 w-full" />
      <USkeleton v-for="n in 4" :key="n" class="h-16 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      title="MCP endpoint unreachable"
      :description="error"
      :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else-if="info">
      <!-- Connection details -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl font-semibold">Endpoint</h2>
            <UBadge color="success" variant="subtle">
              {{ info.tools.length }} tools &middot; protocol {{ info.protocolVersion ?? 'unknown' }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Streamable HTTP URL</div>
            <div class="flex items-center gap-2">
              <code class="text-sm font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">{{ info.url }}</code>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                aria-label="Copy URL"
                @click="copy(info.url, 'URL copied')"
              />
            </div>
          </div>

          <dl class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt class="text-xs text-gray-500 dark:text-gray-400">Server name</dt>
              <dd class="font-medium">{{ info.name }}</dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 dark:text-gray-400">Version</dt>
              <dd class="font-medium">{{ info.version }}</dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 dark:text-gray-400">Transport</dt>
              <dd class="font-medium">HTTP (JSON-RPC 2.0)</dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 dark:text-gray-400">Authentication</dt>
              <dd class="font-medium">None</dd>
            </div>
          </dl>

          <UAlert
            color="warning"
            variant="subtle"
            icon="i-heroicons-shield-exclamation"
            title="The endpoint is unauthenticated"
            description="Anyone who can reach this URL can control the daemon, including removing downloads. Keep it on a trusted network or put a proxy with authentication in front of it."
          />

          <p v-if="info.description" class="text-sm text-gray-600 dark:text-gray-400">{{ info.description }}</p>
        </div>
      </UCard>

      <!-- Client setup -->
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">Connect a client</h2>
        </template>

        <UTabs :items="clientTabs" class="w-full">
          <template #content="{ item }">
            <div class="space-y-2">
              <p class="text-sm text-gray-600 dark:text-gray-400">{{ item.hint }}</p>
              <div class="relative">
                <pre class="text-xs font-mono bg-gray-100 dark:bg-gray-800 rounded p-3 overflow-x-auto"><code>{{ item.snippet }}</code></pre>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-heroicons-clipboard-document"
                  class="absolute top-2 right-2"
                  aria-label="Copy snippet"
                  @click="copy(item.snippet, 'Snippet copied')"
                />
              </div>
            </div>
          </template>
        </UTabs>
      </UCard>

      <!-- Agent instructions -->
      <UCard v-if="info.instructions">
        <template #header>
          <h2 class="text-xl font-semibold">Instructions sent to the agent</h2>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ info.instructions }}</p>
      </UCard>

      <!-- Tools -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl font-semibold">Tools ({{ visibleTools.length }})</h2>
            <UInput
              v-model="search"
              icon="i-heroicons-magnifying-glass"
              placeholder="Filter tools..."
              class="w-full sm:w-56"
            />
          </div>
        </template>

        <UEmpty
          v-if="visibleTools.length === 0"
          icon="i-heroicons-magnifying-glass"
          title="No matches"
          :description="`No tool matches '${search}'.`"
        />

        <TransitionGroup v-else name="list" tag="div" class="space-y-3 relative">
          <div
            v-for="tool in visibleTools"
            :key="tool.name"
            class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg space-y-2"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <code class="text-sm font-mono font-semibold">{{ tool.name }}</code>
              <UBadge v-if="isDestructive(tool.name)" color="error" variant="subtle" size="sm">
                destructive
              </UBadge>
            </div>

            <p class="text-sm text-gray-600 dark:text-gray-400">{{ tool.description }}</p>

            <div v-if="tool.parameters.length > 0" class="flex flex-wrap gap-2">
              <UBadge
                v-for="parameter in tool.parameters"
                :key="parameter.name"
                :color="parameter.required ? 'primary' : 'neutral'"
                variant="subtle"
                size="sm"
                :title="parameter.description"
              >
                {{ parameter.name }}{{ parameter.required ? '*' : '' }}
              </UBadge>
            </div>
            <p v-else class="text-xs text-gray-500 dark:text-gray-400">No parameters</p>
          </div>
        </TransitionGroup>

        <template #footer>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Parameters marked with * are required. Tools flagged destructive require an explicit
            confirmation argument.
          </p>
        </template>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { McpInfo } from '../../server/api/mcp-info.get';

const toast = useToast();

useHead({ title: 'MCP server' });

const info = ref<McpInfo | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const refreshing = ref(false);
const search = ref('');

/** Tools that change or delete state on the daemon. */
const DESTRUCTIVE = ['amule-download-remove', 'amule-server-control', 'amule-network', 'amule-preferences'];
const isDestructive = (name: string) => DESTRUCTIVE.includes(name);

const visibleTools = computed(() => {
  const query = search.value.trim().toLowerCase();
  const tools = info.value?.tools ?? [];
  if (!query) return tools;

  return tools.filter(tool =>
    tool.name.toLowerCase().includes(query)
    || (tool.description ?? '').toLowerCase().includes(query)
  );
});

const clientTabs = computed(() => {
  const url = info.value?.url ?? '';

  return [
    {
      label: 'Claude Code',
      hint: 'Run this once; the server is then available in every session.',
      snippet: `claude mcp add --transport http amule ${url}`
    },
    {
      label: 'Claude Desktop / generic',
      hint: 'Add to the mcpServers section of the client configuration file.',
      snippet: JSON.stringify({ mcpServers: { amule: { type: 'http', url } } }, null, 2)
    },
    {
      label: 'VS Code',
      hint: 'Add to .vscode/mcp.json in your workspace.',
      snippet: JSON.stringify({ servers: { amule: { type: 'http', url } } }, null, 2)
    },
    {
      label: 'curl',
      hint: 'Handy to check the endpoint by hand.',
      snippet: `curl -X POST ${url} \\\n  -H 'content-type: application/json' \\\n  -H 'accept: application/json, text/event-stream' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
    }
  ];
});

async function fetchInfo({ silent = false }: { silent?: boolean } = {}) {
  if (!silent) loading.value = !info.value;
  error.value = null;

  try {
    const result = await $fetch('/api/mcp-info');
    if (result.success && result.data) {
      info.value = result.data;
    } else {
      error.value = result.error || 'Could not read the MCP server information';
    }
  } catch (e: any) {
    error.value = e.message || 'Could not read the MCP server information';
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  await fetchInfo({ silent: true });
  refreshing.value = false;
}

async function copy(value: string, successTitle: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ title: successTitle, color: 'success' });
  } catch {
    toast.add({ title: 'Could not copy to clipboard', description: value, color: 'warning' });
  }
}

onMounted(() => {
  fetchInfo();
});
</script>
