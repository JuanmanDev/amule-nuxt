<template>
  <!-- Nothing is rendered until a finger lands on a labelled control, so this
       adds no markup to the server response and cannot mismatch on hydration. -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="hint"
        ref="bubble"
        role="status"
        data-testid="touch-hint"
        class="fixed z-[100] pointer-events-none max-w-[70vw] rounded-md bg-inverted px-2 py-1 text-xs font-medium text-inverted shadow-lg"
        :style="{
          left: `${hint.x}px`,
          top: `${hint.y}px`,
          transform: `translate(-50%, ${hint.above ? '-100%' : '0'})`
        }"
      >
        {{ hint.label }}
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Speaks the name of controls that only show an icon, on the one input where the
 * usual ways of asking cannot work: a finger. `title` never opens on a touch
 * screen and a hover tooltip has nothing to hover, so the compact icon buttons
 * this app uses on narrow screens - select, sort, direction, clear, the language
 * and theme toggles - would otherwise be unlabelled to exactly the users who see
 * them most.
 *
 * It listens once at the document instead of wrapping each button, so any
 * control that carries an `aria-label` or a `title` is covered, including ones
 * added later. Touch pointers only: a mouse still gets the native tooltip.
 *
 * The press is never swallowed - no `preventDefault`, no capture of the click -
 * so the button does its job while the hint is on screen.
 */

const HIDE_AFTER_MS = 1600;
/** Kept clear of the finger itself. */
const GAP_PX = 8;
/** Breathing room left at the sides of the viewport. */
const EDGE_PX = 8;

type Hint = { label: string; x: number; y: number; above: boolean };

const hint = ref<Hint | null>(null);
const bubble = useTemplateRef<HTMLElement>('bubble');
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The name to say, or null when the control already says it. `innerText` is what
 * the reader actually sees: a label inside a `hidden sm:inline` span measures as
 * empty on a phone and as text on a tablet, which is precisely the line this
 * should follow.
 *
 * `title` wins over `aria-label` where a control has both: the title is the text
 * written to be read ("Descending"), the aria-label the sentence written to be
 * heard ("Descending, switch to ascending").
 */
function hintFor(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;

    const labelled = target.closest<HTMLElement>('[aria-label],[title]');
    if (!labelled) return null;

    const label = (labelled.getAttribute('title') || labelled.getAttribute('aria-label') || '').trim();
    if (!label) return null;

    const visible = (labelled.innerText || '').trim();
    if (visible) return null;

    return label;
}

async function place(element: HTMLElement, label: string) {
    const rect = element.getBoundingClientRect();
    // Above by default so the hint is not under the finger; below when the
    // control sits at the very top of the viewport.
    const above = rect.top > 48;

    hint.value = {
        label,
        x: rect.left + rect.width / 2,
        y: above ? rect.top - GAP_PX : rect.bottom + GAP_PX,
        above
    };

    // Centring on a control near an edge would hang the bubble off screen, and
    // its width is only known once the text has wrapped, so nudge it back in
    // after it renders rather than guessing.
    await nextTick();
    const box = bubble.value?.getBoundingClientRect();
    if (!box || !hint.value) return;

    const overflowLeft = EDGE_PX - box.left;
    const overflowRight = box.right - (window.innerWidth - EDGE_PX);
    if (overflowLeft > 0) hint.value = { ...hint.value, x: hint.value.x + overflowLeft };
    else if (overflowRight > 0) hint.value = { ...hint.value, x: hint.value.x - overflowRight };
}

function hide() {
    hint.value = null;
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
}

function onPointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;

    const label = hintFor(event.target);
    if (!label) {
        hide();
        return;
    }

    void place((event.target as Element).closest<HTMLElement>('[aria-label],[title]')!, label);

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_AFTER_MS);
}

onMounted(() => {
    // Capture, so a component that stops the event on its own root still gets a
    // hint. Passive, because this never blocks the gesture.
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    // A scroll moves the control out from under its hint, so drop it.
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide, { passive: true });
});

onUnmounted(() => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    window.removeEventListener('scroll', hide, true);
    window.removeEventListener('resize', hide);
    if (hideTimer) clearTimeout(hideTimer);
});
</script>
