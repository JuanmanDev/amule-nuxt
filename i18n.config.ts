/**
 * vue-i18n options that the module cannot express on its own.
 *
 * The important one is the fallback: it is per *key*, not per file. A translation
 * that has not caught up with a new screen shows the English string for the
 * strings it is missing and its own language for everything else, which is far
 * better than either an empty label or a whole page reverting to English.
 */

/**
 * How many sources, how many downloads: Slavic languages need three forms where
 * English needs two, and vue-i18n's built-in rule for three branches is
 * "zero | one | other" - which would render "5 источника" instead of
 * "5 источников".
 *
 * The rule below is the standard one/few/many split: 1, 21, 31 take the first
 * form; 2-4, 22-24 take the second; everything else, including the teens, takes
 * the third. Applied only to the languages whose files actually carry three
 * branches; the rest keep two and fall through to the first line.
 */
function slavicPlural(choice: number, choicesLength: number): number {
    if (choicesLength < 3) return choice === 1 ? 0 : 1;

    const mod10 = choice % 10;
    const mod100 = choice % 100;

    if (mod10 === 1 && mod100 !== 11) return 0;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;

    return 2;
}

export default defineI18nConfig(() => ({
    legacy: false,
    fallbackLocale: 'en',
    // A missing key in a translation is expected, not a bug worth a console line
    // on every render; the English fallback is the intended behaviour.
    missingWarn: false,
    fallbackWarn: false,
    pluralRules: {
        ru: slavicPlural,
        uk: slavicPlural,
        pl: slavicPlural
    }
}));
