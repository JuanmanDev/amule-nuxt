<template>
  <UCard class="w-full mx-auto mt-8">
    <UForm :state="form" @submit="handleAdd" class="space-y-4">
      <UFormField label="eD2k or Magnet Link" name="link">
        <UTextarea 
          v-model="form.link" 
          placeholder="ed2k://|file|... or magnet:?xt=..." 
          :rows="3"
          autoresize
        />
      </UFormField>
      <UButton type="submit" :loading="adding" size="lg" block>
        <template #leading>
          <UIcon name="i-heroicons-plus" />
        </template>
        Add Download
      </UButton>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useAmuleApi } from '~/composables/useAmuleApi'

const api = useAmuleApi()
const toast = useToast()

const form = reactive({
  link: ''
})
const adding = ref(false)

async function handleAdd() {
  if (!form.link.trim()) {
    toast.add({ title: 'Please enter a link', color: 'warning' })
    return
  }
  adding.value = true
  try {
    const result = await api.addDownload(form.link) as { success: boolean; error?: string }
    if (result.success) {
      toast.add({ title: 'Download added successfully', color: 'success' })
      form.link = ''
    } else {
      toast.add({ title: 'Failed to add download', description: result.error, color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    adding.value = false
  }
}
</script>
