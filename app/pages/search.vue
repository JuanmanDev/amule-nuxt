<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold mb-2">Search</h1>
      <p class="text-gray-600 dark:text-gray-400">Search for files on the eD2k and Kad networks</p>
    </div>

    <!-- Search Form -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">New Search</h2>
      </template>

      <UForm :state="form" @submit="handleSearch" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UFormField label="Search Type" name="type" class="md:col-span-1">
            <USelect
              v-model="form.type"
              :options="[
                { label: 'Global (eD2k)', value: 'Global' },
                { label: 'Kad Network', value: 'Kad' },
                { label: 'Local', value: 'Local' }
              ]"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormField>

          <UFormField label="Search Keywords" name="keyword" class="md:col-span-2">
            <UInput
              v-model="form.keyword"
              placeholder="Enter search keywords..."
              size="lg"
            />
          </UFormField>
        </div>

        <div class="flex items-center gap-2">
          <UButton type="submit" :loading="searching" size="lg">
            <template #leading>
              <UIcon name="i-heroicons-magnifying-glass" />
            </template>
            Search
          </UButton>
          
          <UButton @click="handleGetResults" :disabled="!hasSearched" variant="outline" size="lg">
            Get Results
          </UButton>
        </div>
      </UForm>
    </UCard>

    <!-- Search Results -->
    <UCard v-if="results.length > 0">
      <template #header>
        <h2 class="text-xl font-semibold">Search Results ({{ results.length }})</h2>
      </template>

      <div class="space-y-3">
        <div
          v-for="result in results"
          :key="result.hash"
          class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold truncate">{{ result.fileName }}</h3>
              <div class="flex flex-wrap gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                <span class="flex items-center gap-1">
                  <UIcon name="i-heroicons-document" class="w-4 h-4" />
                  {{ formatBytes(result.size) }}
                </span>
                <span class="flex items-center gap-1">
                  <UIcon name="i-heroicons-user-group" class="w-4 h-4" />
                  {{ result.sources }} sources
                </span>
              </div>
            </div>

            <UButton
              @click="handleDownload(result.resultNumber)"
              :loading="downloading === result.resultNumber"
              size="sm"
            >
              <template #leading>
                <UIcon name="i-heroicons-arrow-down-tray" />
              </template>
              Download
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <div v-else-if="hasSearched && !loading" class="text-center py-12">
      <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 mx-auto text-gray-400" />
      <p class="mt-4 text-gray-600 dark:text-gray-400">No results found. Try a different search.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const api = useAmuleApi();
const toast = useToast();

useHead({ title: 'Search' });

const form = reactive({
  type: 'Global',
  keyword: ''
});

const searching = ref(false);
const loading = ref(false);
const hasSearched = ref(false);
const results = ref<any[]>([]);
const downloading = ref<number | null>(null);

async function handleSearch() {
  if (!form.keyword.trim()) {
    toast.add({ title: 'Please enter search keywords', color: 'orange' });
    return;
  }

  searching.value = true;
  try {
    const result = await api.search(form.type as any, form.keyword);
    if (result.success) {
      toast.add({ title: 'Search started', description: 'Waiting for results...', color: 'blue' });
      hasSearched.value = true;
      
      // Auto-fetch results after a delay
      setTimeout(handleGetResults, 3000);
    } else {
      toast.add({ title: 'Search failed', description: result.error, color: 'red' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'red' });
  } finally {
    searching.value = false;
  }
}

async function handleGetResults() {
  loading.value = true;
  try {
    const result = await api.getSearchResults();
    if (result.success) {
      results.value = result.data || [];
      toast.add({ title: `Found ${results.value.length} results`, color: 'green' });
    } else {
      toast.add({ title: 'Failed to get results', description: result.error, color: 'red' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'red' });
  } finally {
    loading.value = false;
  }
}

async function handleDownload(resultNumber: number) {
  downloading.value = resultNumber;
  try {
    const result = await api.downloadFromSearch(resultNumber);
    if (result.success) {
      toast.add({ title: 'Download started', color: 'green' });
    } else {
      toast.add({ title: 'Failed to start download', description: result.error, color: 'red' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'red' });
  } finally {
    downloading.value = null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}
</script>
