<template>
  <nav :class="containerClass">
    <UButton
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      variant="ghost"
      color="neutral"
      :class="itemClass"
      @click="$emit('click')"
    >
      <template #leading>
        <UIcon :name="link.icon" :class="iconClass" />
      </template>
      {{ link.label }}
    </UButton>
  </nav>
</template>

<script setup lang="ts">
interface Link {
  label: string
  icon: string
  to: string
}

const props = defineProps<{
  orientation?: 'horizontal' | 'vertical'
  links: Link[]
}>()

defineEmits(['click'])

const containerClass = computed(() => {
  return props.orientation === 'vertical'
    ? 'flex flex-col space-y-1'
    : 'flex items-center gap-1'
})

const itemClass = computed(() => {
  return props.orientation === 'vertical'
    ? 'justify-start px-3 py-2 w-full'
    : ''
})

const iconClass = computed(() => {
  return props.orientation === 'vertical'
    ? 'w-5 h-5'
    : ''
})
</script>
