/**
 * Plural rules for languages vue-i18n does not get right on its own.
 *
 * vue-i18n picks a branch by counting them: two means singular/plural, three
 * means zero/one/other. That third rule is wrong for every Slavic language,
 * which split one / few / many instead - so "5 источника" where it should be
 * "5 источников".
 *
 * Kept here rather than inside the i18n config so it can be tested. A rule that
 * silently picks the wrong branch produces text no test of the catalogue would
 * ever notice.
 */

/**
 * one / few / many, as Russian, Ukrainian and Polish inflect.
 *
 *  * 1, 21, 31, 101 - one          ("1 источник")
 *  * 2-4, 22-24     - few          ("2 источника")
 *  * 0, 5-20, 25-30 - many         ("5 источников")
 *
 * The teens are the exception that catches naive implementations: 11 to 14 take
 * the "many" form even though they end in 1 to 4.
 *
 * Falls through to the ordinary singular/plural split when a message only has
 * two branches, so a language using this rule can still carry English-shaped
 * messages while it is being translated.
 */
export function slavicPlural(choice: number, choicesLength: number): number {
    if (choicesLength < 3) return choice === 1 ? 0 : 1;

    const mod10 = choice % 10;
    const mod100 = choice % 100;

    if (mod10 === 1 && mod100 !== 11) return 0;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;

    return 2;
}
