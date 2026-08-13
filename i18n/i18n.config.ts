/**
 * vue-i18n options that the module cannot express on its own.
 *
 * This file has to live in the i18n directory: the module scans `restructureDir`
 * (which defaults to `i18n`) for it, and a `vueI18n` path in nuxt.config is
 * resolved relative to that same directory. Left in the project root it was
 * silently skipped - with it went the fallback chains below, and every
 * untranslated language rendered raw message keys like "downloads.title"
 * instead of English.
 */

// The `#shared` alias, not a relative path: this file is copied into the Nitro
// build, where "../shared/..." no longer resolves and Rollup fails outright.
import { arabicPlural, lithuanianPlural, slavicPlural, slovenePlural } from '#shared/utils/plurals';

export default defineI18nConfig(() => ({
    legacy: false,
    /*
     * Regional variants fall back to their own language before English.
     *
     * Swiss Italian is Italian apart from a handful of words, and British
     * English differs from American English nowhere in this catalogue at all -
     * so those files hold only what actually differs, and inherit the rest.
     * Copying 431 keys to change three is how translations drift apart.
     */
    fallbackLocale: {
        'it-CH': ['it', 'en'],
        'pt-BR': ['pt', 'en'],
        'en-GB': ['en'],
        default: ['en']
    },
    // A missing key in a translation is expected, not a bug worth a console line
    // on every render; the English fallback is the intended behaviour.
    missingWarn: false,
    fallbackWarn: false,
    /*
     * Applied only to the languages whose files carry more branches than English.
     * Everything else keeps two and uses vue-i18n's own rule, which counts
     * branches to choose one - and gets every language below wrong. See
     * shared/utils/plurals.ts for what each rule splits on.
     */
    pluralRules: {
        ru: slavicPlural,
        uk: slavicPlural,
        pl: slavicPlural,
        hr: slavicPlural,
        sl: slovenePlural,
        lt: lithuanianPlural,
        ar: arabicPlural
    }
}));
