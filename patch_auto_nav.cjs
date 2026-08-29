const fs = require('fs');
let c = fs.readFileSync('app/pages/search-auto.vue', 'utf8');

const target = `<div class="space-y-3">
        <div
          v-for="search in summaries"
          :key="search.id"
          class="rounded-lg border p-3 transition-colors"
          :class="search.id === selectedId
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40'
            : 'border-gray-200 dark:border-gray-800'"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <NuxtLink
              :to="\`/search-auto/\${search.id}\`"
              class="flex flex-1 items-center gap-2 min-w-0 text-left justify-between hover:text-primary-500 transition-colors"
            >
              <div class="font-medium truncate flex gap-2">
                {{ search.keyword }}
                <UBadge :color="statusColor(search.status)" variant="subtle" size="sm">
                  {{ search.status }}
                </UBadge>
              </div>
            </NuxtLink>

            <div class="flex items-center gap-1">
              <UButton
                v-if="search.status === 'finished' || search.status === 'stopped'"
                icon="i-heroicons-play"
                variant="ghost"
                color="neutral"
                size="sm"
                :title="$t('searchAuto.resumePass')"
                @click="resumeOne(search.id)"
              />
              <UButton
                v-if="search.status === 'active' || search.status === 'waiting'"
                icon="i-heroicons-stop"
                variant="ghost"
                color="neutral"
                size="sm"
                :title="$t('searchAuto.stopPass')"
                @click="stopOne(search.id)"
              />
              <UButton
                icon="i-heroicons-trash"
                variant="ghost"
                color="red"
                size="sm"
                :title="$t('searchAuto.removeSearch')"
                @click="removeOne(search)"
              />
            </div>
          </div>

          <div class="mt-2 text-sm text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>{{ $t('searchAuto.networks', { count: search.networks.length, list: search.networks.join(', ') }) }}</span>
            <span v-if="search.status === 'active'">{{ nextPassLabel(search) }}</span>
            <span v-if="search.endsAt">{{ $t('searchAuto.until', { time: time.dateTime(search.endsAt) }) }}</span>
            <span v-else>{{ $t('searchAuto.untilStopped') }}</span>
          </div>

          <p v-if="search.lastError" class="mt-1 text-sm text-red-500">
            {{ $t('searchAuto.lastPassFailed', { error: search.lastError }) }}
          </p>
        </div>
      </div>`;

const replacement = `<div class="space-y-3">
        <NuxtLink
          v-for="search in summaries"
          :key="search.id"
          :to="\`/search-auto/\${search.id}\`"
          class="block rounded-lg border p-3 transition-colors hover:border-primary-500"
          :class="search.id === selectedId
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40'
            : 'border-gray-200 dark:border-gray-800'"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-1 items-center gap-2 min-w-0 text-left justify-between transition-colors">
              <div class="font-medium truncate flex items-center gap-2">
                {{ search.keyword }}
                <UBadge :color="statusColor(search.status)" variant="subtle" size="sm">
                  {{ search.status }}
                </UBadge>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <UButton
                v-if="search.status === 'finished' || search.status === 'stopped'"
                icon="i-heroicons-play"
                variant="ghost"
                color="neutral"
                size="sm"
                :title="$t('searchAuto.resumePass')"
                @click.prevent="resumeOne(search.id)"
              />
              <UButton
                v-if="search.status === 'active' || search.status === 'waiting'"
                icon="i-heroicons-stop"
                variant="ghost"
                color="neutral"
                size="sm"
                :title="$t('searchAuto.stopPass')"
                @click.prevent="stopOne(search.id)"
              />
              <UButton
                icon="i-heroicons-trash"
                variant="ghost"
                color="red"
                size="sm"
                :title="$t('searchAuto.removeSearch')"
                @click.prevent="removeOne(search)"
              />
            </div>
          </div>

          <div class="mt-2 text-sm text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>{{ $t('searchAuto.networks', { count: search.networks.length, list: search.networks.join(', ') }) }}</span>
            <span v-if="search.status === 'active'">{{ nextPassLabel(search) }}</span>
            <span v-if="search.endsAt">{{ $t('searchAuto.until', { time: time.dateTime(search.endsAt) }) }}</span>
            <span v-else>{{ $t('searchAuto.untilStopped') }}</span>
          </div>

          <p v-if="search.lastError" class="mt-1 text-sm text-red-500">
            {{ $t('searchAuto.lastPassFailed', { error: search.lastError }) }}
          </p>
        </NuxtLink>
      </div>`;

if (!c.includes('v-for="search in summaries"')) {
    console.error('Target block not found!');
    process.exit(1);
}

// Just replace the lines
const startIdx = c.indexOf('<div class="space-y-3">');
const endIdx = c.indexOf('</UCard>', startIdx);
if (startIdx !== -1 && endIdx !== -1) {
    const before = c.substring(0, startIdx);
    const after = c.substring(endIdx);
    c = before + replacement + '\\n    ' + after;
    fs.writeFileSync('app/pages/search-auto.vue', c);
    console.log('Patched search-auto.vue successfully');
} else {
    console.error('Could not find start/end indices');
    process.exit(1);
}
