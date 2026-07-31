import { describe, it, expect } from 'vitest';
import { extractEd2kHash, validateDownloadLink } from '../server/utils/amule-ec/links';

const VALID_ED2K = 'ed2k://|file|Some.File.mkv|1132587375|1B73A9AA0DEC788A6DA5A59FB20FCBF0|/';

describe('validateDownloadLink', () => {
    it('accepts a well formed ed2k link', () => {
        expect(validateDownloadLink(VALID_ED2K)).toEqual({ valid: true });
    });

    it('accepts an ed2k link with trailing sections', () => {
        const link = `${VALID_ED2K}|sources,1.2.3.4:4662|/`;
        expect(validateDownloadLink(link).valid).toBe(true);
    });

    it('accepts a magnet link carrying an xt parameter', () => {
        const link = 'magnet:?xt=urn:ed2k:1B73A9AA0DEC788A6DA5A59FB20FCBF0&dn=Some.File.mkv';
        expect(validateDownloadLink(link)).toEqual({ valid: true });
    });

    it('rejects a magnet link without xt', () => {
        const result = validateDownloadLink('magnet:?dn=Some.File.mkv');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('xt');
    });

    it('rejects a non numeric file size', () => {
        const link = 'ed2k://|file|Some.File.mkv|1132ss587375|1B73A9AA0DEC788A6DA5A59FB20FCBF0|/';
        const result = validateDownloadLink(link);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('invalid file size');
    });

    it('rejects a hash that is not 32 hex characters', () => {
        const link = 'ed2k://|file|Some.File.mkv|1132587375|1B73A9aa0DEC788A6DA5A59FB20FCBF054|/';
        const result = validateDownloadLink(link);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('32 hex characters');
    });

    it('rejects a non hexadecimal hash', () => {
        const link = 'ed2k://|file|Some.File.mkv|1132587375|ZZ73A9AA0DEC788A6DA5A59FB20FCBF0|/';
        const result = validateDownloadLink(link);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-hexadecimal');
    });

    it('rejects a zero size link', () => {
        const link = 'ed2k://|file|Some.File.mkv|0|1B73A9AA0DEC788A6DA5A59FB20FCBF0|/';
        expect(validateDownloadLink(link).valid).toBe(false);
    });

    it('rejects a missing file name', () => {
        const link = 'ed2k://|file||1132587375|1B73A9AA0DEC788A6DA5A59FB20FCBF0|/';
        const result = validateDownloadLink(link);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('file name');
    });

    it('rejects a truncated ed2k link', () => {
        expect(validateDownloadLink('ed2k://|file|Some.File.mkv|1132587375|').valid).toBe(false);
    });

    it('rejects ed2k server links (only file links can be queued)', () => {
        expect(validateDownloadLink('ed2k://|server|1.2.3.4|4661|/').valid).toBe(false);
    });

    it('rejects unsupported and empty input', () => {
        expect(validateDownloadLink('http://example.com/file.mkv').valid).toBe(false);
        expect(validateDownloadLink('   ').valid).toBe(false);
        expect(validateDownloadLink(undefined).valid).toBe(false);
    });

    it('validates the exact link reported as falsely accepted', () => {
        const reported = 'ed2k://|file|Rick.y.Morty.9x01.Algo.pasa.con.Morty.(Spanish.English.Subs).WEB-DL.1080p.x264-EAC3.mkv|1132ss587375|1B73A9aa0DEC788A6DA5A59FB20FCBF054|/';
        expect(validateDownloadLink(reported).valid).toBe(false);
    });
});

describe('extractEd2kHash', () => {
    it('returns the lowercased hash of a file link', () => {
        expect(extractEd2kHash(VALID_ED2K)).toBe('1b73a9aa0dec788a6da5a59fb20fcbf0');
    });

    it('returns the hash even when the link carries sources', () => {
        expect(extractEd2kHash(`${VALID_ED2K}|sources,1.2.3.4:4662|/`)).toBe('1b73a9aa0dec788a6da5a59fb20fcbf0');
    });

    it('returns null for a hash of the wrong length', () => {
        expect(extractEd2kHash('ed2k://|file|x|1024|1B73A9aa0DEC788A6DA5A59FB20FCBF054|/')).toBeNull();
    });

    it('returns null for non file links and non strings', () => {
        expect(extractEd2kHash('ed2k://|server|1.2.3.4|4661|/')).toBeNull();
        expect(extractEd2kHash('magnet:?xt=urn:ed2k:abc')).toBeNull();
        expect(extractEd2kHash(42)).toBeNull();
    });
});
