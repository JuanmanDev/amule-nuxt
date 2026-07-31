<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold">API Test Page</h1>
      <UBadge color="warning">Development Only</UBadge>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">aMule API Endpoints</h2>
      </template>

      <div class="space-y-4">
        <!-- Status API -->
        <div class="border-b pb-4">
          <h3 class="font-medium mb-2">Connection & Status</h3>
          <div class="flex gap-2 flex-wrap">
            <UButton @click="testAPI('GET', '/api/amule/status')" size="sm">
              GET /status
            </UButton>
            <UButton @click="testAPI('POST', '/api/amule/connect')" size="sm" color="success">
              POST /connect
            </UButton>
            <UButton @click="testAPI('POST', '/api/amule/disconnect')" size="sm" color="error">
              POST /disconnect
            </UButton>
          </div>
        </div>

        <!-- Downloads API -->
        <div class="border-b pb-4">
          <h3 class="font-medium mb-2">Downloads</h3>
          <div class="flex gap-2 flex-wrap">
            <UButton @click="testAPI('GET', '/api/amule/downloads')" size="sm">
              GET /downloads
            </UButton>
            <UButton @click="testDownloadAdd" size="sm" color="info">
              POST /downloads/add
            </UButton>
          </div>
          <div class="mt-2">
            <UInput v-model="downloadLink" placeholder="ed2k://..." size="sm" class="max-w-md" />
          </div>
        </div>

        <!-- Search API -->
        <div class="border-b pb-4">
          <h3 class="font-medium mb-2">Search</h3>
          <div class="flex gap-2 flex-wrap">
            <UButton @click="testSearch" size="sm" color="info">
              POST /search (Start)
            </UButton>
            <UButton @click="testAPI('GET', '/api/amule/search/results')" size="sm">
              GET /search/results
            </UButton>
          </div>
          <div class="mt-2 flex gap-2">
            <UInput v-model="searchKeyword" placeholder="Search keyword..." size="sm" class="max-w-xs" />
            <USelect v-model="searchType" :items="['Global', 'Local', 'Kad']" size="sm" class="w-32" />
          </div>
        </div>

        <!-- Servers API -->
        <div class="border-b pb-4">
          <h3 class="font-medium mb-2">Servers</h3>
          <div class="flex gap-2 flex-wrap">
            <UButton @click="testAPI('GET', '/api/amule/servers')" size="sm">
              GET /servers
            </UButton>
          </div>
        </div>

        <!-- Files API -->
        <div class="border-b pb-4">
          <h3 class="font-medium mb-2">Files</h3>
          <div class="flex gap-2 flex-wrap">
            <UButton @click="testAPI('GET', '/api/amule/shared')" size="sm">
              GET /shared
            </UButton>
            <UButton @click="testAPI('GET', '/api/amule/uploads')" size="sm">
              GET /uploads
            </UButton>
          </div>
        </div>

        <!-- Statistics & Logs -->
        <div class="border-b pb-4">
          <h3 class="font-medium mb-2">Statistics & Logs</h3>
          <div class="flex gap-2 flex-wrap">
            <UButton @click="testAPI('GET', '/api/amule/statistics')" size="sm">
              GET /statistics
            </UButton>
            <UButton @click="testAPI('GET', '/api/amule/logs')" size="sm">
              GET /logs
            </UButton>
          </div>
        </div>

        <!-- Bandwidth -->
        <div class="pb-4">
          <h3 class="font-medium mb-2">Bandwidth</h3>
          <div class="flex gap-2 flex-wrap">
            <UButton @click="testAPI('GET', '/api/amule/bandwidth')" size="sm">
              GET /bandwidth
            </UButton>
            <UButton @click="testBandwidthSet" size="sm" color="info">
              POST /bandwidth (Set)
            </UButton>
          </div>
          <div class="mt-2 flex gap-2">
            <UInput v-model.number="uploadLimit" type="number" placeholder="Upload (KB/s)" size="sm" class="w-40" />
            <UInput v-model.number="downloadLimit" type="number" placeholder="Download (KB/s)" size="sm" class="w-40" />
          </div>
        </div>
      </div>
    </UCard>

    <!-- Response Display -->
    <UCard v-if="response">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Response</h2>
          <div class="flex gap-2">
            <UBadge :color="response.success ? 'success' : 'error'">
              {{ response.success ? 'Success' : 'Error' }}
            </UBadge>
            <UButton @click="copyResponse" size="xs" variant="ghost" icon="i-heroicons-clipboard" />
          </div>
        </div>
      </template>

      <div class="space-y-2">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          <strong>{{ lastRequest.method }}</strong> {{ lastRequest.url }}
        </div>
        <UTextarea
          v-model="responseText"
          :rows="20"
          
          readonly
          class="font-mono text-sm w-full"
          :ui="{
            base: 'relative inline-flex items-center font-mono text-sm'
          }"
        />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const response = ref<any>(null)
const responseText = ref('')
const lastRequest = ref({ method: '', url: '' })

// Form inputs
const downloadLink = ref('ed2k://|file|example.zip|1234567890|ABCDEF1234567890|/')
const searchKeyword = ref('test')
const searchType = ref('Global')
const uploadLimit = ref(0)
const downloadLimit = ref(0)

async function testAPI(method: string, url: string, body?: any) {
  lastRequest.value = { method, url }
  try {
    const options: any = { method }
    if (body) {
      options.body = body
    }
    
    const result = await $fetch(url, options)
    response.value = result
    responseText.value = JSON.stringify(result, null, 2)
  } catch (error: any) {
    response.value = {
      success: false,
      error: error.message || 'Request failed'
    }
    responseText.value = JSON.stringify(response.value, null, 2)
  }
}

async function testDownloadAdd() {
  if (!downloadLink.value.trim()) {
    alert('Please enter a download link')
    return
  }
  await testAPI('POST', '/api/amule/downloads/add', { link: downloadLink.value })
}

async function testSearch() {
  if (!searchKeyword.value.trim()) {
    alert('Please enter a search keyword')
    return
  }
  await testAPI('POST', '/api/amule/search', {
    keyword: searchKeyword.value,
    type: searchType.value
  })
}

async function testBandwidthSet() {
  await testAPI('POST', '/api/amule/bandwidth', {
    uploadLimit: uploadLimit.value,
    downloadLimit: downloadLimit.value
  })
}

function copyResponse() {
  if (responseText.value) {
    navigator.clipboard.writeText(responseText.value)
  }
}

// SEO
useHead({
  title: 'API Test'
})
</script>
