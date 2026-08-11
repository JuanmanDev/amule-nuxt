<!--
  Animates anything that appears, disappears or gets replaced.

  CSS cannot transition `height: auto`, so the element's real height is measured
  and pinned for the duration of the transition, then handed back to the layout.
  That keeps the surrounding page from jumping when a skeleton turns into a list,
  a list turns into an empty state, or an alert shows up above a list.

  Two shapes:

    <SmoothSwap>                     one block that comes and goes
      <div v-if="error">…</div>
    </SmoothSwap>

    <SmoothSwap mode="out-in">       several blocks taking turns; give each a key
      <Skeletons v-if="loading" key="loading" />
      <List v-else key="list" />
    </SmoothSwap>

  One rule: at least one branch inside must be able to render during SSR. A
  <Transition> whose every branch is false renders nothing on the server, and
  hydrating that empty transition throws inside Vue itself
  ("el.hasAttribute is not a function") - taking the hydration of everything
  below it down with it. Where all the branches are conditional, put the same
  condition on <SmoothSwap> as well:

    <SmoothSwap v-if="notice">
      <Alert v-if="notice === 'a'" key="a" />
      <Alert v-else key="b" />
    </SmoothSwap>

  `prefers-reduced-motion` is honoured by the stylesheet: the classes still apply,
  their durations are zero.
-->
<template>
  <Transition
    name="smooth-swap"
    :mode="transitionMode"
    :appear="appear"
    @enter="onEnter"
    @after-enter="clear"
    @enter-cancelled="clear"
    @leave="onLeave"
    @after-leave="clear"
    @leave-cancelled="clear"
  >
    <slot />
  </Transition>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  /**
   * `default` overlaps the two blocks, which reads best for a single block that
   * comes and goes. `out-in` collapses the old one first and is the right choice
   * when one state replaces another.
   */
  mode?: 'default' | 'out-in' | 'in-out';
  /** Animate the very first render too. Off by default: page loads should not creep in. */
  appear?: boolean;
}>(), {
  mode: 'out-in',
  appear: false
});

const transitionMode = computed(() => (props.mode === 'default' ? undefined : props.mode));

/**
 * The transition runs on height, so a block whose own margins collapse outside
 * the animated box would still jump. Margins are neutralised for the duration
 * and restored afterwards.
 */
function pin(el: HTMLElement, from: string, to: string) {
  el.style.overflow = 'hidden';
  el.style.height = from;
  // Force layout so the browser has a start value to animate from.
  void el.offsetHeight;
  el.style.height = to;
}

function onEnter(element: Element) {
  const el = element as HTMLElement;
  pin(el, '0px', `${el.scrollHeight}px`);
}

function onLeave(element: Element) {
  const el = element as HTMLElement;
  pin(el, `${el.scrollHeight}px`, '0px');
}

/** Hand the height back to the layout, so nested content can still resize. */
function clear(element: Element) {
  const el = element as HTMLElement;
  el.style.height = '';
  el.style.overflow = '';
}
</script>
