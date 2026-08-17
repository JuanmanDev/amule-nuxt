/**
 * Nuxt UI theme overrides.
 *
 * Cards and other surfaces are translucent with a backdrop blur so the activity
 * background stays visible behind the content instead of being covered by opaque
 * panels. Doing it in the theme keeps every card consistent, rather than repeating
 * the classes on each page.
 *
 * Cards are frameless: no ring, no divider lines between header, body and
 * footer, no background of their own and no side padding. A card is just the
 * vertical rhythm of a section - its title close above its content - and the
 * surfaces belong to the elements inside it (rows, tiles), which carry the
 * translucent blur themselves.
 *
 * The classes below neutralise rather than replace: Nuxt UI *extends* the
 * default theme with these strings (tailwind-variants), so `ring` from the
 * default can only be beaten by an explicit `ring-0`, never by omission.
 */
export default defineAppConfig({
    ui: {
        card: {
            slots: {
                root: 'ring-0 divide-y-0 bg-transparent overflow-visible transition-shadow duration-300',
                // Sides flush with the page; the body's top padding is all the
                // separation the title needs
                header: 'px-0 sm:px-0 pb-0',
                body: 'px-0 sm:px-0',
                footer: 'px-0 sm:px-0 pt-0'
            },
            variants: {
                variant: {
                    outline: {
                        root: 'ring-0 divide-y-0 bg-transparent'
                    },
                    subtle: {
                        root: 'ring-0 divide-y-0 bg-transparent'
                    },
                    soft: {
                        root: 'ring-0 divide-y-0 bg-transparent'
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
