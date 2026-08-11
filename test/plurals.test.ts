import { describe, it, expect } from 'vitest';
import { slavicPlural } from '../shared/utils/plurals';

/**
 * The forms, using "источник" (source) as the example:
 *
 *   0 -> many   1 -> one    2 -> few    5 -> many
 *  11 -> many  21 -> one   22 -> few   25 -> many
 */
describe('slavicPlural', () => {
    const branch = (count: number) => slavicPlural(count, 3);

    it('uses the "one" form for 1 and for numbers ending in 1', () => {
        expect(branch(1)).toBe(0);
        expect(branch(21)).toBe(0);
        expect(branch(31)).toBe(0);
        expect(branch(101)).toBe(0);
    });

    it('uses the "few" form for 2 to 4 and numbers ending in them', () => {
        for (const count of [2, 3, 4, 22, 23, 24, 102]) {
            expect(branch(count), `${count} should take the few form`).toBe(1);
        }
    });

    it('uses the "many" form for 0, 5 to 20, and the rest', () => {
        for (const count of [0, 5, 6, 9, 10, 15, 20, 25, 30, 100]) {
            expect(branch(count), `${count} should take the many form`).toBe(2);
        }
    });

    it('puts the teens in the "many" form even though they end in 1 to 4', () => {
        // The exception that catches naive implementations: 11 is not "one",
        // and 12 to 14 are not "few"
        for (const count of [11, 12, 13, 14, 111, 112]) {
            expect(branch(count), `${count} should take the many form`).toBe(2);
        }
    });

    it('falls back to a plain singular/plural split for a two-branch message', () => {
        // Lets a three-form language carry an English-shaped message while it is
        // still being translated, rather than picking a branch that is not there
        expect(slavicPlural(1, 2)).toBe(0);
        expect(slavicPlural(2, 2)).toBe(1);
        expect(slavicPlural(5, 2)).toBe(1);
    });

    it('never picks a branch the message does not have', () => {
        for (let count = 0; count <= 120; count += 1) {
            expect(slavicPlural(count, 3)).toBeLessThan(3);
            expect(slavicPlural(count, 2)).toBeLessThan(2);
        }
    });
});
