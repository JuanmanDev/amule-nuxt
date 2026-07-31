<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-3xl font-bold mb-1">Add download</h1>
      <p class="text-gray-600 dark:text-gray-400">Paste one or more eD2k or magnet links</p>
    </div>

    <UCard>
      <!-- Same component, and therefore the same behaviour, as the dashboard and the queue page -->
      <AddLinkForm label="eD2k or magnet links" multiline @added="router.push('/downloads')" />
    </UCard>

    <UButton to="/downloads" variant="link" trailing-icon="i-heroicons-arrow-right">
      Open the download queue
    </UButton>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Add download' });

const router = useRouter();
</script>
