<!--
  Which link to aMule is answering. amuleapi (the REST daemon aMule 3.1 ships)
  is tried first when configured; the External Connection is the fallback every
  aMule speaks. Read from /api/diagnostics.

  The comment lives outside <template> on purpose: inside it, before the root,
  it would make the root a fragment in development, and a fragment inside the
  settings page's <SmoothSwap> transition breaks hydration.
-->
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600 dark:text-gray-400">{{ $t('settings.link.title') }}</span>
        <UBadge :color="activeColor" variant="subtle" size="sm">
          <template #leading>
            <span class="inline-block w-1.5 h-1.5 rounded-full" :class="activeDot" />
          </template>
          {{ activeLabel }}
        </UBadge>
      </div>
      <UBadge color="neutral" variant="outline" size="sm" class="font-mono">
        {{ $t('settings.link.mode') }}: {{ backend.mode }}
      </UBadge>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <!-- amuleapi -->
      <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg space-y-1.5" :class="backend.active === 'amuleapi' ? 'ring-1 ring-primary/40' : ''">
        <div class="flex items-center justify-between gap-2">
          <div class="font-medium flex items-center gap-1.5">
            <UIcon name="i-heroicons-cloud" class="text-primary" />
            amuleapi
            <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">REST · aMule 3.1+</span>
          </div>
          <UBadge :color="apiState.color" variant="subtle" size="xs">{{ apiState.label }}</UBadge>
        </div>
        <div v-if="backend.amuleapi.configured" class="text-sm font-mono break-all text-gray-700 dark:text-gray-300">
          {{ backend.amuleapi.address }}
        </div>
        <div v-if="probe?.amuleapiVersion" class="text-xs text-gray-600 dark:text-gray-400">
          amuleapi {{ probe.amuleapiVersion }}<template v-if="probe.daemonVersion"> · amuled {{ probe.daemonVersion }}</template>
          <template v-if="backend.amuleapi.role"> · {{ backend.amuleapi.role }}</template>
        </div>
        <UBadge v-if="probe?.updateAvailable" color="warning" variant="soft" size="xs" icon="i-heroicons-arrow-up-circle">
          {{ $t('settings.link.updateAvailable', { version: probe.latestVersion ?? '?' }) }}
        </UBadge>
        <p v-if="apiProblem" class="text-xs text-amber-600 dark:text-amber-400 break-words">{{ apiProblem }}</p>
        <p v-if="!backend.amuleapi.configured" class="text-xs text-gray-500 dark:text-gray-400 leading-snug">
          {{ $t('settings.link.apiHint') }}
        </p>
      </div>

      <!-- External Connection -->
      <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg space-y-1.5" :class="backend.active === 'ec' ? 'ring-1 ring-primary/40' : ''">
        <div class="flex items-center justify-between gap-2">
          <div class="font-medium flex items-center gap-1.5">
            <UIcon name="i-heroicons-link" class="text-gray-500" />
            {{ $t('settings.link.ec') }}
            <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">EC · {{ $t('settings.link.anyVersion') }}</span>
          </div>
          <UBadge :color="ecState.color" variant="subtle" size="xs">{{ ecState.label }}</UBadge>
        </div>
        <div class="text-sm font-mono break-all text-gray-700 dark:text-gray-300">{{ backend.ec.address }}</div>
        <p v-if="backend.ec.lastError && backend.ec.lastErrorAt > backend.ec.lastOkAt" class="text-xs text-amber-600 dark:text-amber-400 break-words">
          {{ backend.ec.lastError }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Diagnostics } from '../../server/api/diagnostics.get';

const props = defineProps<{
  backend: Diagnostics['backend'];
}>();

const { t } = useI18n();

const probe = computed(() => props.backend.amuleapiProbe);

const activeLabel = computed(() => {
  if (props.backend.active === 'amuleapi') return t('settings.link.viaApi');
  if (props.backend.active === 'ec') return t('settings.link.viaEc');
  return t('settings.link.none');
});

const activeColor = computed(() => (props.backend.active ? 'success' : 'warning') as 'success' | 'warning');
const activeDot = computed(() => (props.backend.active ? 'bg-emerald-500' : 'bg-amber-500'));

type State = { label: string; color: 'success' | 'warning' | 'error' | 'neutral' };

const apiState = computed<State>(() => {
  const api = props.backend.amuleapi;
  if (props.backend.mode === 'ec') return { label: t('settings.link.disabled'), color: 'neutral' };
  if (!api.configured) return { label: t('settings.link.notConfigured'), color: 'neutral' };
  if (!api.available) return { label: t('settings.link.coolingDown'), color: 'warning' };
  if (probe.value && !probe.value.reachable) return { label: t('settings.link.unreachable'), color: 'error' };
  if (probe.value?.ecConnected === false) return { label: t('settings.link.daemonDown'), color: 'warning' };
  return { label: t('settings.link.answering'), color: 'success' };
});

const apiProblem = computed(() => {
  const api = props.backend.amuleapi;
  if (!api.configured) return '';
  return api.unavailableReason || probe.value?.error || '';
});

const ecState = computed<State>(() => {
  const ec = props.backend.ec;
  if (props.backend.mode === 'amuleapi') return { label: t('settings.link.disabled'), color: 'neutral' };
  if (!ec.configured) return { label: t('settings.link.notConfigured'), color: 'neutral' };
  if (ec.lastOkAt === 0 && ec.lastErrorAt === 0) return { label: t('settings.link.standby'), color: 'neutral' };
  if (ec.lastErrorAt > ec.lastOkAt) return { label: t('settings.link.unreachable'), color: 'error' };
  return { label: t('settings.link.answering'), color: 'success' };
});
</script>
