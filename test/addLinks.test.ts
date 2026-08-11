import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities, splitLinks, summariseAddResults } from '../shared/utils/addLinks';
import type { AddLinkResult, AddLinksResult } from '../shared/types/api';

const result = (status: AddLinkResult['status'], overrides: Partial<AddLinkResult> = {}): AddLinkResult => ({
    link: 'ed2k://|file|file.bin|1024|abcdef0123456789abcdef0123456789|/',
    success: status !== 'rejected',
    status,
    message: status === 'added'
        ? 'Download added'
        : status === 'duplicate'
            ? "Already in the download queue as 'file.bin' - aMule merged the sources"
            : 'ed2k link has an invalid file size',
    ...overrides
});

const payload = (results: AddLinkResult[]): AddLinksResult => ({
    results,
    added: results.filter(entry => entry.status === 'added').length,
    duplicates: results.filter(entry => entry.status === 'duplicate').length,
    rejected: results.filter(entry => entry.status === 'rejected').length
});

describe('summariseAddResults', () => {
    it('handles an empty payload', () => {
        expect(summariseAddResults(null).title).toBe('Nothing to add');
        expect(summariseAddResults(payload([])).total).toBe(0);
    });

    it('reports a single added link as success', () => {
        const summary = summariseAddResults(payload([result('added')]));
        expect(summary.title).toBe('Download added');
        expect(summary.color).toBe('success');
        expect(summary.anyAdded).toBe(true);
    });

    it('reports a single duplicate as a warning naming the existing file', () => {
        const summary = summariseAddResults(payload([result('duplicate', { existingName: 'file.bin' })]));
        expect(summary.title).toBe('Already in aMule');
        expect(summary.color).toBe('warning');
        expect(summary.description).toContain('Already in the download queue');
        expect(summary.anyAdded).toBe(false);
        expect(summary.duplicates).toBe(1);
    });

    it('reports a single rejected link as an error with the reason', () => {
        const summary = summariseAddResults(payload([result('rejected')]));
        expect(summary.title).toBe('Link rejected');
        expect(summary.color).toBe('error');
        expect(summary.description).toContain('invalid file size');
    });

    it('summarises a mixed batch and lists the exceptions', () => {
        const summary = summariseAddResults(payload([
            result('added'),
            result('duplicate', { existingName: 'already.bin' }),
            result('rejected')
        ]));

        expect(summary.title).toBe('Added 1 of 3 links');
        expect(summary.color).toBe('warning');
        expect(summary.description).toContain('1 link already in aMule: already.bin');
        expect(summary.description).toContain('1 link rejected');
    });

    it('uses success only when every link in a batch is new', () => {
        const summary = summariseAddResults(payload([result('added'), result('added')]));
        expect(summary.title).toBe('Added 2 of 2 links');
        expect(summary.color).toBe('success');
        expect(summary.description).toBeUndefined();
    });

    it('says nothing new was added when a batch is all duplicates', () => {
        const summary = summariseAddResults(payload([
            result('duplicate', { existingName: 'a.bin' }),
            result('duplicate', { existingName: 'b.bin' })
        ]));

        expect(summary.title).toBe('Nothing new added');
        expect(summary.color).toBe('warning');
        expect(summary.description).toContain('2 links already in aMule: a.bin, b.bin');
        expect(summary.anyAdded).toBe(false);
    });

    it('errors when a whole batch is rejected', () => {
        const summary = summariseAddResults(payload([result('rejected'), result('rejected')]));
        expect(summary.title).toBe('No links added');
        expect(summary.color).toBe('error');
    });
});

describe('splitLinks', () => {
    const first = 'ed2k://|file|First.File.mkv|1132587375|1B73A9AA0DEC788A6DA5A59FB20FCBF0|/';
    const second = 'ed2k://|file|Second.File.mkv|993|2B73A9AA0DEC788A6DA5A59FB20FCBF1|/';
    const magnet = 'magnet:?xt=urn:ed2k:3B73A9AA0DEC788A6DA5A59FB20FCBF2&dn=Third.File.mkv';

    it('splits one link per line', () => {
        expect(splitLinks([first, second].join('\n'))).toEqual([first, second]);
    });

    it('splits links that a single line input glued together', () => {
        // A single line <input> strips the newlines out of a paste, which is how a
        // batch of twenty links arrived as one string and only the first was added
        expect(splitLinks(first + second)).toEqual([first, second]);
    });

    it('splits links separated by spaces or blank lines', () => {
        expect(splitLinks(`${first} ${second}`)).toEqual([first, second]);
        expect(splitLinks([first, '', '', second].join('\n'))).toEqual([first, second]);
        expect(splitLinks([first, second].join('\r\n'))).toEqual([first, second]);
    });

    it('handles ed2k and magnet links in one paste', () => {
        expect(splitLinks([magnet, first].join('\n'))).toEqual([magnet, first]);
        expect(splitLinks(magnet + first)).toEqual([magnet, first]);
    });

    it('keeps the sources section, whose commas are not separators', () => {
        const withSources = `${first}|sources,1.2.3.4:4662,5.6.7.8:4662|/`;
        expect(splitLinks(withSources)).toEqual([withSources]);
    });

    it('keeps spaces inside a file name', () => {
        const spaced = 'ed2k://|file|A File With Spaces.mkv|10|4B73A9AA0DEC788A6DA5A59FB20FCBF3|/';
        expect(splitLinks(spaced)).toEqual([spaced]);
        expect(splitLinks(spaced + second)).toEqual([spaced, second]);
    });

    it('ignores whatever surrounds the links', () => {
        expect(splitLinks(`look at this: ${first}  `)).toEqual([first]);
    });

    it('drops exact duplicates', () => {
        expect(splitLinks([first, first, second].join('\n'))).toEqual([first, second]);
    });

    it('returns nothing for empty input', () => {
        expect(splitLinks('')).toEqual([]);
        expect(splitLinks(' \n  ')).toEqual([]);
    });

    it('falls back to lines when nothing looks like a link, so it is still reported', () => {
        expect(splitLinks('not a link\nalso not a link')).toEqual(['not a link', 'also not a link']);
    });

    it('undoes the HTML escaping a link picks up from a web page', () => {
        // The daemon names the part file after the link, so this is what produced
        // downloads called "C&oacute;digo.Da.Vinci.mkv"
        const escaped = 'ed2k://|file|C&oacute;digo.Da.Vinci.mkv|10|5B73A9AA0DEC788A6DA5A59FB20FCBF4|/';
        expect(splitLinks(escaped)).toEqual([
            'ed2k://|file|Código.Da.Vinci.mkv|10|5B73A9AA0DEC788A6DA5A59FB20FCBF4|/'
        ]);
    });

    it('restores the parameter separators of an escaped magnet link', () => {
        expect(splitLinks('magnet:?xt=urn:ed2k:3B73A9AA0DEC788A6DA5A59FB20FCBF2&amp;dn=Third.File.mkv'))
            .toEqual([magnet]);
    });
});

describe('decodeHtmlEntities', () => {
    it('decodes named letters in both cases', () => {
        expect(decodeHtmlEntities('C&oacute;digo &Ntilde;u &uuml;ber')).toBe('Código Ñu über');
    });

    it('decodes symbols and numeric escapes', () => {
        expect(decodeHtmlEntities('Rock &amp; Roll')).toBe('Rock & Roll');
        expect(decodeHtmlEntities('C&#243;digo &#xe9;xito')).toBe('Código éxito');
    });

    it('leaves anything that is not an entity alone', () => {
        expect(decodeHtmlEntities('Tom&Jerry; 100&nothing;')).toBe('Tom&Jerry; 100&nothing;');
        expect(decodeHtmlEntities('a & b')).toBe('a & b');
    });

    it('runs once, so a name that really contains an escape survives', () => {
        expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;');
    });

    it('refuses control characters, which have no place in a file name', () => {
        expect(decodeHtmlEntities('a&#0;b&#10;c')).toBe('a&#0;b&#10;c');
    });
});
