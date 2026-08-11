<!--
  A list whose rows animate in and out, and glide when they reorder.

  <TransitionGroup name="list"> on its own only fades and slides a row: the space
  it occupies still appears and disappears in one frame, so the rows below snap.
  This component measures each row and animates its height and its bottom margin
  as well, which is what makes an added row push the list open and a removed row
  close the gap behind it.

  Spacing is deliberately NOT `space-y-*`. Those margins come from `* + *`, so the
  moment a leaving row is finally dropped from the DOM the margins are handed to a
  different row and the list jumps by one gap. Here every row carries the same
  bottom margin and the container cancels the trailing one, so removing any row -
  first, middle or last - changes nothing for the others.

    <AnimatedList gap="1rem">
      <Row v-for="row in rows" :key="row.id" :row="row" />
    </AnimatedList>

  Each row must be a single element, and `prefers-reduced-motion` drops both the
  transitions (stylesheet) and the stagger (below).
-->
<template>
  <!--
    The name is what is switched for a whole-list swap, not `css`.

    Toggling `css` changes the transition mode underneath rows that are already
    mid-flight, and Vue then runs its move bookkeeping against nodes it recorded
    under the other mode. Swapping to a name no stylesheet defines leaves the
    mechanism alone and simply gives every class an empty rule set, so nothing
    animates and nothing is left half-transitioned.
  -->
  <TransitionGroup
    :name="swapping ? 'list-instant' : 'list-smooth'"
    :tag="tag"
    class="animated-list"
    :style="{ '--list-gap': gap }"
    :appear="appear"
    @enter="onEnter"
    @after-enter="clear"
    @enter-cancelled="clear"
    @leave="onLeave"
    @after-leave="clear"
    @leave-cancelled="clear"
  >
    <slot />
  </TransitionGroup>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** Space between rows; any CSS length. */
  gap?: string;
  /** Element rendered around the rows. */
  tag?: string;
  /**
   * Animate the rows that are already there on the first render. Off by default:
   * the block itself is usually animated by <SmoothSwap>, which measures the
   * block, and rows collapsed to zero height would make it measure too short.
   */
  appear?: boolean;
  /** Milliseconds between rows when several enter at once. 0 disables it. */
  stagger?: number;
  /**
   * Identifies *which* rows are being shown, as opposed to what they contain.
   * When it changes the next update is treated as a swap of the whole list -
   * turning a page, say - and is not animated at all.
   *
   * Animating it would be wrong twice over: a hundred rows leaving while a
   * hundred others enter is not a change the user made to any row, and with a
   * stagger it would take seconds to settle.
   */
  resetKey?: string | number;
}>(), {
  gap: '1rem',
  tag: 'div',
  appear: false,
  stagger: 45,
  resetKey: ''
});

/** True for the single flush that applies a whole-list swap. */
const swapping = ref(false);

watch(() => props.resetKey, async () => {
  swapping.value = true;
  // Two ticks: one for the rows to be replaced with transitions off, one more
  // before they are armed again, so the swap cannot arm them mid-flight.
  await nextTick();
  await nextTick();
  swapping.value = false;
});

/**
 * Rows entering within the same tick form a batch and are delayed one after the
 * other; a single row added by a poll is a batch of one and starts immediately.
 */
let entering = 0;
let resetBatch: ReturnType<typeof setTimeout> | undefined;

function nextInBatch(): number {
  const index = entering++;
  if (resetBatch) clearTimeout(resetBatch);
  resetBatch = setTimeout(() => { entering = 0; }, 0);
  return index;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The four values a row has to give up to take no space at all. */
interface Box {
  height: string;
  marginBottom: string;
  paddingTop: string;
  paddingBottom: string;
}

const FLAT: Box = { height: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' };

/**
 * The natural box of a row. `offsetHeight` rather than `scrollHeight` because it
 * includes the border and ignores the transform the enter class has applied.
 *
 * The padding is part of it because rows are `border-box`: a row at height 0 with
 * `p-4` still stands 34px tall, so it would hang there for the whole transition
 * and then snap out of the list when it is finally dropped.
 */
function measure(el: HTMLElement): Box {
  const style = getComputedStyle(el);
  return {
    height: `${el.offsetHeight}px`,
    marginBottom: style.marginBottom,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom
  };
}

function apply(el: HTMLElement, box: Box) {
  el.style.height = box.height;
  el.style.marginBottom = box.marginBottom;
  el.style.paddingTop = box.paddingTop;
  el.style.paddingBottom = box.paddingBottom;
}

/** Target boxes waiting for the next frame, so an interrupted row can drop them. */
const pending = new WeakMap<HTMLElement, number>();

function onEnter(element: Element) {
  // A whole-list swap: `:css="false"` has already dropped the transitions, and
  // measuring rows that are not going to animate only costs layout passes.
  if (swapping.value) return;

  const el = element as HTMLElement;
  const index = nextInBatch();

  if (index > 0 && props.stagger > 0 && !reducedMotion()) {
    el.style.transitionDelay = `${index * props.stagger}ms`;
  }

  const box = measure(el);
  el.style.overflow = 'hidden';

  /*
   * Collapsed with transitions off, then committed by reading the layout.
   *
   * Without that the row is already carrying the enter class, so setting the
   * padding to zero starts a transition towards zero; putting the real padding
   * back on the next frame only reverses it, and the row never collapses at all.
   * It pops in one padding tall and grows from there, which is the jump that is
   * left once the height alone is animated.
   */
  el.style.transition = 'none';
  apply(el, FLAT);
  void el.offsetHeight;

  pending.set(el, requestAnimationFrame(() => {
    pending.delete(el);
    el.style.transition = '';
    apply(el, box);
  }));
}

function onLeave(element: Element) {
  if (swapping.value) return;

  const el = element as HTMLElement;
  // The row has been sitting at its natural box for frames, so the browser
  // already has every start value; it can collapse straight away.
  const box = measure(el);
  el.style.overflow = 'hidden';
  apply(el, box);
  void el.offsetHeight;
  apply(el, FLAT);
}

/** Hand the box back to the layout, so the row can still resize on its own. */
function clear(element: Element) {
  const el = element as HTMLElement;

  const frame = pending.get(el);
  if (frame !== undefined) {
    cancelAnimationFrame(frame);
    pending.delete(el);
  }

  el.style.height = '';
  el.style.marginBottom = '';
  el.style.paddingTop = '';
  el.style.paddingBottom = '';
  el.style.overflow = '';
  el.style.transition = '';
  el.style.transitionDelay = '';
}
</script>
