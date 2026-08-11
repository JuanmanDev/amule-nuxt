/**
 * Turns the per-link results of an add request into one message.
 *
 * Every place that can add a link (downloads page, dashboard, the modal in the
 * header, the add page) uses this, so a duplicate or a rejected link is always
 * reported the same way.
 */

import type { AddLinkResult, AddLinksResult } from '../types/api';

/**
 * Letters that survive a trip through HTML.
 *
 * A link copied out of a rendered page - or worse, out of a page's source - keeps
 * whatever escaping that page used, so `Código` arrives as `C&oacute;digo` and the
 * daemon happily names the part file after it. Only the uppercase form has to be
 * derived: `&Oacute;` is `&oacute;` with the first letter capitalised, and the
 * character follows the same rule.
 */
const HTML_LETTER_ENTITIES: Record<string, string> = {
    aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
    ccedil: 'ç',
    eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
    iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
    ntilde: 'ñ',
    oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
    uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
    yacute: 'ý', yuml: 'ÿ',
    eth: 'ð', thorn: 'þ'
};

/** Punctuation and symbols, which have no case to derive. */
const HTML_SYMBOL_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    szlig: 'ß', copy: '©', reg: '®', trade: '™', deg: '°',
    ordf: 'ª', ordm: 'º', iexcl: '¡', iquest: '¿', laquo: '«', raquo: '»',
    middot: '·', bull: '•', hellip: '…', ndash: '–', mdash: '—',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', prime: '′', Prime: '″',
    euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶',
    plusmn: '±', times: '×', divide: '÷', frac12: '½', frac14: '¼', frac34: '¾',
    sup1: '¹', sup2: '²', sup3: '³', micro: 'µ'
};

const HTML_ENTITIES: Record<string, string> = { ...HTML_SYMBOL_ENTITIES };

for (const [name, character] of Object.entries(HTML_LETTER_ENTITIES)) {
    HTML_ENTITIES[name] = character;
    HTML_ENTITIES[name[0]!.toUpperCase() + name.slice(1)] = character.toUpperCase();
}

/** Anything below a space is a control character and has no place in a link. */
const isPrintable = (codePoint: number) =>
    codePoint >= 0x20 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff);

/**
 * Turns HTML escapes back into the characters they stand for.
 *
 * Runs exactly once over the text, so a name that genuinely contains `&amp;`
 * cannot be unescaped twice, and anything that is not a known entity (`Tom&Jerry;`)
 * is left exactly as it was found. Numeric escapes are covered too, since some
 * sites emit `&#243;` rather than `&oacute;`.
 */
export function decodeHtmlEntities(text: string): string {
    return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
        if (body.startsWith('#')) {
            const codePoint = body[1] === 'x' || body[1] === 'X'
                ? Number.parseInt(body.slice(2), 16)
                : Number.parseInt(body.slice(1), 10);

            return Number.isFinite(codePoint) && isPrintable(codePoint)
                ? String.fromCodePoint(codePoint)
                : match;
        }

        return HTML_ENTITIES[body] ?? match;
    });
}

/**
 * Every link in a pasted blob, however it was separated.
 *
 * Splitting on newlines alone was not enough: a single line <input> strips the
 * newlines out of a multi-link paste, so twenty links arrived as one string and
 * only the first was ever added. A scheme therefore starts a new link wherever it
 * appears - after a newline, after a space, or glued straight onto the previous
 * link - and text before the first scheme is ignored, so pasting a link out of a
 * sentence works too.
 *
 * Commas and semicolons are deliberately not separators: an ed2k link carries them
 * inside its own `sources,1.2.3.4:4662` section. Spaces inside a file name survive
 * for the same reason, since only the next scheme ends a link.
 *
 * Exact duplicates are dropped, so pasting the same batch twice does not ask the
 * daemon about every link twice.
 *
 * HTML escapes are undone first: links are copied out of web pages, and the daemon
 * takes the name in the link literally, so `C&oacute;digo.avi` became a part file
 * called exactly that. It matters for magnet links twice over, since `&amp;`
 * between their parameters would otherwise be part of the previous value.
 */
export function splitLinks(text: string): string[] {
    const trimmed = decodeHtmlEntities((text ?? '').trim());
    if (!trimmed) return [];

    const found = trimmed.match(/(?:ed2k:\/\/|magnet:\?)[\s\S]*?(?=ed2k:\/\/|magnet:\?|$)/gi);

    // Nothing that looks like a link: fall back to lines, so whatever was typed
    // still reaches validation and is reported instead of vanishing.
    const candidates = found ?? trimmed.split(/\r?\n/);

    const seen = new Set<string>();
    return candidates
        .map(candidate => candidate.trim())
        .filter(candidate => candidate.length > 0)
        .filter(candidate => {
            const key = candidate.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

export interface AddLinksSummary {
    added: number;
    duplicates: number;
    rejected: number;
    total: number;
    /** Toast title. */
    title: string;
    /** Toast description; empty when the title says everything. */
    description?: string;
    color: 'success' | 'warning' | 'error';
    /** True when at least one link produced a new download. */
    anyAdded: boolean;
}

const listNames = (results: AddLinkResult[]) => results
    .map(result => result.existingName || result.link)
    .join(', ');

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function summariseAddResults(data: AddLinksResult | undefined | null): AddLinksSummary {
    const results = data?.results ?? [];
    const added = results.filter(result => result.status === 'added');
    const duplicates = results.filter(result => result.status === 'duplicate');
    const rejected = results.filter(result => result.status === 'rejected');

    const summary: AddLinksSummary = {
        added: added.length,
        duplicates: duplicates.length,
        rejected: rejected.length,
        total: results.length,
        title: 'Nothing to add',
        color: 'warning',
        anyAdded: added.length > 0
    };

    if (results.length === 0) {
        return summary;
    }

    // Single link: say exactly what happened to it
    if (results.length === 1) {
        const [only] = results as [AddLinkResult];
        return {
            ...summary,
            title: only.status === 'added'
                ? 'Download added'
                : only.status === 'duplicate'
                    ? 'Already in aMule'
                    : 'Link rejected',
            description: only.message,
            color: only.status === 'added' ? 'success' : only.status === 'duplicate' ? 'warning' : 'error'
        };
    }

    // Batch: lead with the counts, then explain the exceptions
    const parts: string[] = [];
    if (duplicates.length > 0) parts.push(`${plural(duplicates.length, 'link')} already in aMule: ${listNames(duplicates)}`);
    if (rejected.length > 0) parts.push(`${plural(rejected.length, 'link')} rejected: ${rejected.map(result => result.message).join('; ')}`);

    return {
        ...summary,
        title: added.length > 0
            ? `Added ${added.length} of ${results.length} links`
            : rejected.length === results.length
                ? 'No links added'
                : 'Nothing new added',
        description: parts.join(' | ') || undefined,
        color: rejected.length > 0 ? (added.length > 0 ? 'warning' : 'error') : duplicates.length > 0 ? 'warning' : 'success'
    };
}
