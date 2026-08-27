import { NAV_ORDER } from '~/utils/nav'

/**
 * Which way the next page transition travels.
 *
 * The navigation is a fixed strip in a fixed order, so moving from Downloads to
 * Uploads has a direction the way turning a page does. `data-nav-dir` on <html>
 * carries it to the stylesheet, which slides the outgoing page one way and the
 * incoming page in from the other (see "Page transitions" in main.css).
 *
 * Two deliberate simplifications:
 *
 *  * A route that is not in the menu (/add, /handle-link, or anything opened from
 *    a link) has no place in the order, so it counts as forward. Coming back out
 *    of it is forward as well, which reads better than guessing.
 *  * The browser's Back button is only detected through the order, not through
 *    history: going back to a page that sits *later* in the menu still animates
 *    forward. Reading the real history position would mean tracking popstate
 *    against vue-router's own listener, and getting it wrong is worse than a
 *    transition that occasionally travels the wrong way by 24 pixels.
 *
 * Client only: there is no transition on the first render, and no document to
 * stamp during SSR.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()

  router.beforeEach((to, from) => {
    const fromIndex = NAV_ORDER.indexOf(from.path)
    const toIndex = NAV_ORDER.indexOf(to.path)
    const back = fromIndex > -1 && toIndex > -1 && toIndex < fromIndex

    document.documentElement.dataset.navDir = back ? 'back' : 'forward'
  })
})
