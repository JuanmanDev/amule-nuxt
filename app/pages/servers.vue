<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold mb-2">Servers</h1>
        <p class="text-gray-600 dark:text-gray-400">Manage eD2k server list</p>
      </div>
      <UButton @click="refresh" :loading="refreshing" icon="i-heroicons-arrow-path">
        Refresh
      </UButton>
    </div>

    <!-- Server list maintenance -->
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">Server list settings</h2>
          <UButton
            variant="outline"
            icon="i-heroicons-arrow-down-tray"
            :loading="updatingList"
            @click="updateFromUrl"
          >
            Update list now
          </UButton>
        </div>
      </template>

      <SmoothSwap>
      <div v-if="prefsLoading" key="prefs-loading" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <USkeleton v-for="n in 4" :key="n" class="h-10 w-full" />
      </div>

      <UForm v-else-if="prefs" key="prefs-form" :state="prefsForm" class="space-y-4" @submit="savePrefs">
        <UFormField label="Server list URL" name="updateUrl" help="server.met used by 'Update list now'">
          <UInput v-model="prefsForm.updateUrl" class="w-full" placeholder="http://upd.emule-security.org/server.met" />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <USwitch v-model="prefsForm.autoUpdate" label="Update the list at startup" />
          <USwitch v-model="prefsForm.removeDead" label="Remove dead servers" />
          <USwitch v-model="prefsForm.addFromServer" label="Add servers announced by servers" />
          <USwitch v-model="prefsForm.addFromClient" label="Add servers announced by clients" />
        </div>

        <UFormField label="Retries before a server counts as dead" name="deadServerRetries" class="max-w-xs">
          <UInput v-model.number="prefsForm.deadServerRetries" type="number" min="0" max="255" class="w-full" />
        </UFormField>

        <UButton type="submit" :loading="savingPrefs" icon="i-heroicons-check">Save settings</UButton>
      </UForm>
      </SmoothSwap>
    </UCard>

    <!-- Add a server -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Add server</h2>
      </template>

      <UForm :state="addForm" @submit="handleAdd" class="flex flex-col sm:flex-row gap-3 sm:items-end">
        <UFormField label="Address" name="address" help="Format: ip:port" class="flex-1">
          <UInput v-model="addForm.address" placeholder="176.123.5.89:4725" class="w-full" />
        </UFormField>
        <UFormField label="Name (optional)" name="name" class="flex-1">
          <UInput v-model="addForm.name" placeholder="My server" class="w-full" />
        </UFormField>
        <UButton type="submit" :loading="adding" :disabled="!addForm.address.trim()" icon="i-heroicons-plus">
          Add
        </UButton>
      </UForm>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">Server list ({{ servers.length.toLocaleString() }})</h2>
          <ListControls
            v-model:search="search"
            v-model:sort-by="sortBy"
            v-model:direction="direction"
            :options="sortOptions"
            placeholder="Filter servers..."
            class="sm:max-w-md"
          />
        </div>
      </template>

      <!-- Loading is the default state until the first fetch resolves -->
      <SmoothSwap>
      <div v-if="loading" key="loading" class="space-y-4">
        <div v-for="n in 4" :key="n" class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg space-y-3">
          <USkeleton class="h-5 w-1/3" />
          <USkeleton class="h-4 w-1/2" />
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <USkeleton v-for="c in 5" :key="c" class="h-8 w-full" />
          </div>
        </div>
        <p class="text-center text-sm text-gray-600 dark:text-gray-400">Loading servers...</p>
      </div>

      <UAlert
        v-else-if="error"
        key="error"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        title="Failed to load servers"
        :description="error"
        :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() }]"
      />

      <UEmpty
        v-else-if="servers.length === 0"
        key="empty"
        icon="i-heroicons-server-stack"
        title="No servers found"
        description="aMule's server list is empty. Add a server or update the list from a URL."
      />

      <UEmpty
        v-else-if="visibleServers.length === 0"
        key="no-matches"
        icon="i-heroicons-magnifying-glass"
        title="No matches"
        :description="`No server matches '${search}'.`"
      />

      <AnimatedList v-else key="rows" gap="1rem" :reset-key="pageKey">
        <div
          v-for="server in visibleServers"
          :key="server.ip + ':' + server.port"
          class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 min-w-0">
                <h3 class="font-semibold truncate" :title="server.name">{{ server.name }}</h3>
                <UBadge v-if="isConnected(server)" color="success" variant="subtle" size="sm" class="shrink-0">
                  Connected
                </UBadge>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 truncate">{{ server.description }}</p>
              
              <div class="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Address</span>
                  <span class="font-medium">{{ server.ip }}:{{ server.port }}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Users</span>
                  <span class="font-medium">{{ server.users.toLocaleString() }}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Files</span>
                  <span class="font-medium">{{ server.files.toLocaleString() }}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Priority</span>
                  <UBadge variant="outline" size="xs">{{ server.priority }}</UBadge>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Failed connects</span>
                  <UBadge :color="server.failed > 0 ? 'warning' : 'success'" size="sm" class="w-fit">
                    {{ server.failed > 0 ? server.failed : 'None' }}
                  </UBadge>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Ping</span>
                  <span class="font-medium">{{ server.ping ? `${server.ping} ms` : '-' }}</span>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <UButton
                  size="xs"
                  variant="outline"
                  icon="i-heroicons-link"
                  :loading="busyAddress === address(server) && busyAction === 'connect'"
                  :disabled="isConnected(server)"
                  @click="handleConnect(server)"
                >
                  {{ isConnected(server) ? 'Connected' : 'Connect' }}
                </UButton>
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-heroicons-trash"
                  :loading="busyAddress === address(server) && busyAction === 'remove'"
                  @click="askRemove(server)"
                >
                  Remove
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </AnimatedList>
      </SmoothSwap>

      <!-- A list updated from a URL runs to thousands of servers -->
      <ListPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :page-count="pageCount"
        :matched="matched"
        :total="total"
        :first-on-page="firstOnPage"
        :last-on-page="lastOnPage"
        label="servers"
        class="mt-4"
      />
    </UCard>

    <UModal v-model:open="removeOpen" title="Remove server">
      <template #body>
        <p class="text-sm">
          Remove <span class="font-semibold">{{ pendingRemove?.name }}</span>
          ({{ pendingRemove ? address(pendingRemove) : '' }}) from the server list?
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="() => { removeOpen = false }">Cancel</UButton>
          <UButton color="error" :loading="busyAction === 'remove'" @click="confirmRemove">Remove</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AmulePreferences } from '../../server/utils/amule-types'
import type { SortOption } from '#shared/utils/sorting'

useHead({ title: 'Servers' })

const api = useAmuleApi()
const toast = useToast()
const { status } = useAmuleStatus()

const servers = ref<any[]>([])

const sortOptions: SortOption[] = [
  { label: 'Users', value: 'users', defaultDirection: 'desc' },
  { label: 'Files', value: 'files', defaultDirection: 'desc' },
  { label: 'Ping', value: 'ping', defaultDirection: 'asc' },
  { label: 'Failed connects', value: 'failed', defaultDirection: 'desc' },
  { label: 'Name', value: 'name', defaultDirection: 'asc' }
]

const sortAccessors = {
  users: (server: any) => server.users,
  files: (server: any) => server.files,
  ping: (server: any) => server.ping || Number.MAX_SAFE_INTEGER,
  failed: (server: any) => server.failed,
  name: (server: any) => server.name
}
const adding = ref(false)
const busyAddress = ref<string | null>(null)
const busyAction = ref<'connect' | 'remove' | null>(null)
const removeOpen = ref(false)
const pendingRemove = ref<any | null>(null)

const addForm = reactive({ address: '', name: '' })

const prefs = ref<AmulePreferences | null>(null)
const prefsLoading = ref(true)
const savingPrefs = ref(false)
const updatingList = ref(false)
const prefsForm = reactive({
  updateUrl: '',
  autoUpdate: false,
  removeDead: false,
  addFromServer: false,
  addFromClient: false,
  deadServerRetries: 0
})

async function fetchPreferences() {
  try {
    const result = await api.getPreferences()
    if (result.success && result.data) {
      prefs.value = result.data
      prefsForm.updateUrl = result.data.servers.updateUrl
      prefsForm.autoUpdate = result.data.servers.autoUpdate
      prefsForm.removeDead = result.data.servers.removeDead
      prefsForm.addFromServer = result.data.servers.addFromServer
      prefsForm.addFromClient = result.data.servers.addFromClient
      prefsForm.deadServerRetries = result.data.servers.deadServerRetries
    }
  } catch {
    // The list itself still works without the preferences
  } finally {
    prefsLoading.value = false
  }
}

async function savePrefs() {
  savingPrefs.value = true
  try {
    const result = await api.setPreferences({ servers: { ...prefsForm } })
    toast.add({
      title: result.success ? (result.message || 'Server settings saved') : 'Could not save settings',
      description: result.success ? undefined : result.error,
      color: result.success ? 'success' : 'error'
    })
    if (result.success) await fetchPreferences()
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    savingPrefs.value = false
  }
}

async function updateFromUrl() {
  updatingList.value = true
  try {
    const result = await api.updateServerList(prefsForm.updateUrl.trim() || undefined)
    toast.add({
      title: result.success ? (result.message || 'Updating the server list') : 'Could not update the list',
      description: result.success ? undefined : result.error,
      color: result.success ? 'success' : 'error'
    })
    if (result.success) {
      // The daemon downloads in the background; refresh shortly after
      setTimeout(() => fetchServers(true), 3000)
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    updatingList.value = false
  }
}

const address = (server: any) => `${server.ip}:${server.port}`

/** The server aMule is currently connected to, reported by the status endpoint. */
const isConnected = (server: any) =>
  Boolean(status.value?.ed2kConnected && status.value?.serverIP && status.value.serverIP === server.ip)

const {
  search,
  sortBy,
  direction,
  page,
  pageSize,
  pageKey,
  visible: visibleServers,
  matched,
  total,
  pageCount,
  firstOnPage,
  lastOnPage
} = usePaginatedList<any>({
  items: servers,
  fields: (server: any) => [server.name, server.ip, server.port, server.description],
  accessors: sortAccessors,
  sortBy: 'users',
  direction: 'desc',
  storageKey: 'servers'
})

async function handleAdd() {
  adding.value = true
  try {
    const result = await api.addServer(addForm.address.trim(), addForm.name.trim() || undefined)

    if (result.success) {
      toast.add({ title: result.message || 'Server added', color: 'success' })
      addForm.address = ''
      addForm.name = ''
      await fetchServers(true)
    } else {
      toast.add({ title: 'Could not add server', description: result.error, color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    adding.value = false
  }
}

async function handleConnect(server: any) {
  busyAddress.value = address(server)
  busyAction.value = 'connect'
  try {
    const result = await api.connectToServer(address(server))

    if (result.success) {
      toast.add({ title: result.message || `Connecting to ${server.name}`, color: 'success' })
    } else {
      toast.add({ title: 'Could not connect', description: result.error, color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    busyAddress.value = null
    busyAction.value = null
  }
}

function askRemove(server: any) {
  pendingRemove.value = server
  removeOpen.value = true
}

async function confirmRemove() {
  const server = pendingRemove.value
  if (!server) return

  busyAddress.value = address(server)
  busyAction.value = 'remove'
  try {
    const result = await api.removeServer(address(server))
    if (result.success) {
      toast.add({ title: result.message || 'Server removed', color: 'warning' })
      await fetchServers(true)
    } else {
      toast.add({ title: 'Could not remove server', description: result.error, color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    busyAddress.value = null
    busyAction.value = null
    removeOpen.value = false
    pendingRemove.value = null
  }
}
// Start in the loading state so the first paint never shows "no servers"
const loading = ref(true)
const error = ref<string | null>(null)
const refreshing = ref(false)

async function fetchServers(silent = false) {
  if (!silent) loading.value = true
  error.value = null
  try {
    const result = await api.getServers()
    if (result.success) {
      servers.value = result.data || []
    } else {
      error.value = result.error || 'Failed to load servers'
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load servers'
  } finally {
    loading.value = false
  }
}

async function refresh() {
  refreshing.value = true
  await fetchServers(true)
  refreshing.value = false
}

onMounted(() => {
  fetchServers()
  fetchPreferences()
})
</script>
