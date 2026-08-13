import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The message catalogue is checked, not just assumed.
 *
 * `en.json` is the source: every other locale is a translation of some subset of
 * it. Missing keys are fine and fall back to English one key at a time (see
 * i18n.config.ts), so this does not demand completeness - but it does demand
 * that what *is* there is real: a key nobody reads is a translation that will
 * never appear, and a placeholder that does not match the English one produces a
 * string with a literal {name} in it.
 */

const LOCALES_DIR = join(process.cwd(), 'i18n', 'locales');

type Messages = Record<string, any>;

function flatten(messages: Messages, prefix = ''): Record<string, string> {
    const flat: Record<string, string> = {};

    for (const [key, value] of Object.entries(messages)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(flat, flatten(value, path));
        } else {
            flat[path] = String(value);
        }
    }

    return flat;
}

/**
 * `{name}`, `{count}` and friends - what vue-i18n will try to substitute.
 *
 * Distinct, not every occurrence: a language with three plural branches writes
 * `{count}` three times where English writes it twice, and that is correct, not
 * a mismatch. What matters is that no translation invents a placeholder the
 * caller never passes, or drops one the sentence needs.
 */
function placeholders(message: string): string[] {
    return [...new Set(message.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])].sort();
}

/**
 * The plural branches of a message.
 *
 * `|` separates them - except inside a `{'|'}` literal, which is how a message
 * carries a pipe of its own. The eD2k link template in the add-links
 * placeholder is exactly that, and counting its five pipes as plural forms is
 * the same mistake vue-i18n would make if it were not escaped.
 */
function pluralBranches(message: string): string[] {
    return message.replace(/\{'[^']*'\}/g, '').split('|');
}

const files = readdirSync(LOCALES_DIR).filter(name => name.endsWith('.json'));
const english = flatten(JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf8')));
const englishKeys = new Set(Object.keys(english));

describe('locales', () => {
    it('ships one file per locale the app advertises', () => {
        const config = readFileSync(join(process.cwd(), 'nuxt.config.ts'), 'utf8');
        const declared = [...config.matchAll(/file:\s*'([^']+\.json)'/g)].map(match => match[1]!);

        expect(declared.length).toBeGreaterThan(30);
        for (const file of declared) {
            expect(files, `${file} is declared in nuxt.config.ts`).toContain(file);
        }
    });

    /**
     * The states in `useFileStatus` are turned into message keys by name
     * (`status.${state}`), which means a state whose key is spelled differently
     * renders the key itself in the interface - "status.shared" appeared on every
     * already-shared search result exactly that way. Nothing else can catch it:
     * a missing key is a legitimate, silent fallback everywhere else.
     */
    it('has a status message for every file state', () => {
        const source = readFileSync(join(process.cwd(), 'app', 'composables', 'useFileStatus.ts'), 'utf8');
        const declared = source.match(/export type FileState =([^;]+);/)?.[1] ?? '';

        const states = [...declared.matchAll(/'([a-z]+)'/g)]
            .map(match => match[1]!)
            // 'unknown' is the one state with nothing to show
            .filter(state => state !== 'unknown');

        expect(states.length).toBeGreaterThan(3);
        for (const state of states) {
            expect(englishKeys, `status.${state} is used by useFileStatus`).toContain(`status.${state}`);
        }
    });

    it.each(files)('%s is valid JSON', file => {
        expect(() => JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'))).not.toThrow();
    });

    it.each(files.filter(file => file !== 'en.json'))('%s only defines keys English has', file => {
        const messages = flatten(JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')));

        // A key that English does not have is dead weight: nothing reads it, and
        // it is usually a typo in a nested path
        const unknown = Object.keys(messages).filter(key => !englishKeys.has(key));
        expect(unknown, `${file} has keys that do not exist in en.json`).toEqual([]);
    });

    it.each(files.filter(file => file !== 'en.json'))('%s keeps the placeholders of every string it translates', file => {
        const messages = flatten(JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')));

        const broken = Object.entries(messages)
            .filter(([key, value]) => englishKeys.has(key))
            .filter(([key, value]) => placeholders(value).join() !== placeholders(english[key]!).join())
            .map(([key]) => key);

        expect(broken, `${file} changed or dropped a placeholder`).toEqual([]);
    });

    /**
     * How many plural branches each language writes.
     *
     * Not every language splits where English does: Slavic languages need three
     * forms (one / few / many, so "1 источник", "2 источника", "5 источников"),
     * and Japanese, Chinese and Korean need one because they do not inflect for
     * number at all. Anything not listed uses English's two.
     *
     * A language with three branches must also have a matching rule in
     * `i18n.config.ts` - vue-i18n's built-in rule for three is zero/one/other,
     * which is not what any of these languages do.
     */
    const PLURAL_FORMS: Record<string, number> = {
        ru: 3, uk: 3, pl: 3, hr: 3, lt: 3,
        sl: 4,
        ar: 6,
        ja: 1, ko: 1, 'zh-CN': 1, 'zh-TW': 1
    };

    /**
     * Which rule each of those languages is wired to, since they do not all split
     * the same way: Slovene keeps a dual, and Lithuanian's "few" runs to 9 and
     * gives up the whole of the teens rather than only 11 to 14.
     */
    const PLURAL_RULES: Record<string, string> = {
        ru: 'slavicPlural', uk: 'slavicPlural', pl: 'slavicPlural', hr: 'slavicPlural',
        sl: 'slovenePlural',
        lt: 'lithuanianPlural',
        ar: 'arabicPlural'
    };

    it.each(files.filter(file => file !== 'en.json'))('%s writes the plural forms its language needs', file => {
        const locale = file.replace('.json', '');
        const expected = PLURAL_FORMS[locale] ?? pluralBranches(english['search.result.sources']!).length;
        const messages = flatten(JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')));

        const wrong = Object.entries(messages)
            .filter(([key]) => englishKeys.has(key) && pluralBranches(english[key]!).length > 1)
            .filter(([, value]) => pluralBranches(value).length !== expected)
            .map(([key, value]) => `${key} (${pluralBranches(value).length}, expected ${expected})`);

        expect(wrong, `${file} should use ${expected} plural form(s)`).toEqual([]);
    });

    it('backs every language with extra forms with the right plural rule', () => {
        const config = readFileSync(join(process.cwd(), 'i18n', 'i18n.config.ts'), 'utf8');

        // More branches than English with vue-i18n's default rule means
        // zero/one/other, which silently renders the wrong form rather than
        // failing. The rule also has to be the one that language actually uses:
        // wiring Slovene to the Russian rule would pass a "has a rule" check and
        // still never reach its dual.
        for (const [locale, forms] of Object.entries(PLURAL_FORMS)) {
            if (forms < 3) continue;
            expect(PLURAL_RULES[locale], `${locale} has no rule named`).toBeDefined();
            expect(config, `${locale} needs a pluralRules entry`).toContain(`${locale}: ${PLURAL_RULES[locale]}`);
        }
    });

    /**
     * Not an assertion, a report: partial locales are expected and supported.
     * This is here so "which languages are actually done" is answerable without
     * opening 38 files.
     */
    /**
     * Regional variants are deltas, not copies: they inherit their base language
     * (see `fallbackLocale` in i18n.config.ts) and hold only what differs. Every
     * key they *do* define must therefore actually differ from the base, or it is
     * a copy that will silently stop tracking the language it came from.
     */
    it.each([['it-CH', 'it'], ['pt-BR', 'pt'], ['en-GB', 'en']])('%s only overrides what differs from %s', (variant, base) => {
        const variantFile = join(LOCALES_DIR, `${variant}.json`);
        const baseFile = join(LOCALES_DIR, `${base}.json`);

        const messages = flatten(JSON.parse(readFileSync(variantFile, 'utf8')));
        const baseMessages = flatten(JSON.parse(readFileSync(baseFile, 'utf8')));

        const redundant = Object.entries(messages)
            .filter(([key, value]) => baseMessages[key] === value)
            .map(([key]) => key);

        expect(redundant, `${variant}.json repeats ${base}.json`).toEqual([]);
    });

    it('reports how complete each locale is', () => {
        const report = files
            .filter(file => file !== 'en.json')
            .map(file => {
                const messages = flatten(JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')));
                const translated = Object.keys(messages).filter(key => englishKeys.has(key)).length;
                return {
                    locale: file.replace('.json', ''),
                    percent: Math.round((translated / englishKeys.size) * 100)
                };
            })
            .sort((a, b) => b.percent - a.percent);

        const complete = report.filter(entry => entry.percent === 100).map(entry => entry.locale);
        const partial = report.filter(entry => entry.percent > 0 && entry.percent < 100);
        const untranslated = report.filter(entry => entry.percent === 0).map(entry => entry.locale);

        console.log(`\n  ${englishKeys.size} keys in en.json`);
        console.log(`  complete: ${complete.length ? complete.join(', ') : 'none'}`);
        if (partial.length) {
            console.log(`  partial:  ${partial.map(entry => `${entry.locale} ${entry.percent}%`).join(', ')}`);
        }
        console.log(`  falling back to English: ${untranslated.length ? untranslated.join(', ') : 'none'}\n`);

        expect(englishKeys.size).toBeGreaterThan(200);
    });
});
