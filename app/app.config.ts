/**
 * Nuxt UI theme overrides.
 *
 * Cards and other surfaces are translucent with a backdrop blur so the activity
 * background stays visible behind the content instead of being covered by opaque
 * panels. Doing it in the theme keeps every card consistent, rather than repeating
 * the classes on each page.
 */
export default defineAppConfig({
    ui: {
        card: {
            slots: {
                root: 'rounded-lg overflow-hidden backdrop-blur-md transition-shadow duration-300'
            },
            variants: {
                variant: {
                    outline: {
                        root: 'bg-default/70 ring ring-default divide-y divide-default'
                    },
                    subtle: {
                        root: 'bg-elevated/60 ring ring-default divide-y divide-default'
                    },
                    soft: {
                        root: 'bg-elevated/50 divide-y divide-default'
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
