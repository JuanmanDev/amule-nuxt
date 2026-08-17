/**
 * Nuxt UI theme overrides.
 *
 * Cards and other surfaces are translucent with a backdrop blur so the activity
 * background stays visible behind the content instead of being covered by opaque
 * panels. Doing it in the theme keeps every card consistent, rather than repeating
 * the classes on each page.
 *
 * No rings and no divider lines: a card is one translucent surface, and the
 * title reads as part of its content rather than a boxed-off bar. The header
 * keeps its own padding and the body drops the gap left by the divider, so the
 * two sit close enough to read as connected.
 */
export default defineAppConfig({
    ui: {
        card: {
            slots: {
                root: 'rounded-lg overflow-hidden backdrop-blur-md transition-shadow duration-300',
                // The body's own top padding is all the separation the title needs
                header: 'pb-0',
                footer: 'pt-0'
            },
            variants: {
                variant: {
                    outline: {
                        root: 'bg-default/70'
                    },
                    subtle: {
                        root: 'bg-elevated/60'
                    },
                    soft: {
                        root: 'bg-elevated/50'
                    }
                }
            }
        },

        modal: {
            slots: {
                content: 'backdrop-blur-xl bg-default/90'
            }
        },

        // Toasts float above the animated background too
        toast: {
            slots: {
                root: 'backdrop-blur-md bg-default/85'
            }
        }
    }
});
