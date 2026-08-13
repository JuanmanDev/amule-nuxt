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

/**
 * one / two / few / other, as Slovene inflects.
 *
 * Slovene kept the dual, so it needs a form the other Slavic languages here do
 * not: two of a thing is neither singular nor plural but its own ending.
 *
 *  * 1, 101, 201    - one    ("1 vir")
 *  * 2, 102, 202    - two    ("2 vira")
 *  * 3-4, 103-104   - few    ("3 viri")
 *  * 0, 5-100       - other  ("5 virov")
 *
 * Unlike the rule above it is the last two digits that decide, with no teen
 * exception: 111 takes "one" because 11 does.
 */
export function slovenePlural(choice: number, choicesLength: number): number {
    if (choicesLength < 4) return choice === 1 ? 0 : choicesLength - 1;

    const mod100 = choice % 100;

    if (mod100 === 1) return 0;
    if (mod100 === 2) return 1;
    if (mod100 === 3 || mod100 === 4) return 2;

    return 3;
}

/**
 * one / few / other, as Lithuanian inflects.
 *
 * Close to the Slavic rule but not the same: "few" reaches all the way to 9
 * rather than stopping at 4, and the whole of 11 to 19 - not just 11 to 14 -
 * falls through to "other".
 *
 *  * 1, 21, 31      - one    ("1 šaltinis")
 *  * 2-9, 22-29     - few    ("2 šaltiniai")
 *  * 0, 10-20, 30   - other  ("10 šaltinių")
 */
export function lithuanianPlural(choice: number, choicesLength: number): number {
    if (choicesLength < 3) return choice === 1 ? 0 : 1;

    const mod10 = choice % 10;
    const mod100 = choice % 100;
    const teen = mod100 >= 11 && mod100 <= 19;

    if (mod10 === 1 && !teen) return 0;
    if (mod10 >= 2 && mod10 <= 9 && !teen) return 1;

    return 2;
}
