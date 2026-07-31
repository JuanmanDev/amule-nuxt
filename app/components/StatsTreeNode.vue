<template>
  <li>
    <!-- Leaf nodes are plain lines; branches collapse so a deep tree stays readable -->
    <div v-if="node.children.length === 0" class="py-0.5 text-sm break-words">
      {{ node.label }}
    </div>

    <UCollapsible v-else v-model:open="open">
      <template #default>
        <button
          type="button"
          class="w-full flex items-center gap-2 py-1 text-left text-sm font-medium hover:text-primary-600 dark:hover:text-primary-400"
        >
          <UIcon
            :name="open ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
            class="w-4 h-4 shrink-0"
          />
          <span class="break-words">{{ node.label }}</span>
          <span class="text-xs text-gray-400">({{ node.children.length }})</span>
        </button>
      </template>

      <template #content>
        <ul class="ps-6 border-s border-gray-200 dark:border-gray-800 ms-2">
          <StatsTreeNode
            v-for="(child, index) in node.children"
            :key="`${child.label}-${index}`"
            :node="child"
            :depth="depth + 1"
          />
        </ul>
      </template>
    </UCollapsible>
  </li>
</template>

<script setup lang="ts">
import type { StatsTreeNode as StatsTreeNodeType } from '../../server/utils/amule-ec/statsTree';

const props = withDefaults(defineProps<{
  node: StatsTreeNodeType;
  depth?: number;
}>(), { depth: 0 });

// Top two levels start expanded; deeper branches stay collapsed
const open = ref(props.depth < 1);
</script>
