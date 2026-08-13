import { describe, it, expect } from 'vitest';
import { lithuanianPlural, slavicPlural, slovenePlural } from '../shared/utils/plurals';

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

/**
 * The forms, using "vir" (source) as the example:
 *
 *   0 -> other  1 -> one    2 -> two    3 -> few    5 -> other
 * 101 -> one  102 -> two  103 -> few  111 -> one
 */
describe('slovenePlural', () => {
    const branch = (count: number) => slovenePlural(count, 4);

    it('uses the "one" form when the last two digits are 1', () => {
        for (const count of [1, 101, 201, 1001]) {
            expect(branch(count), `${count} should take the one form`).toBe(0);
        }
    });

    it('keeps a dual for two', () => {
        // The form the other Slavic rules here have no branch for at all
        for (const count of [2, 102, 202]) {
            expect(branch(count), `${count} should take the two form`).toBe(1);
        }
    });

    it('uses the "few" form for 3 and 4', () => {
        for (const count of [3, 4, 103, 104]) {
            expect(branch(count), `${count} should take the few form`).toBe(2);
        }
    });

    it('uses the "other" form for 0, 5 to 100, and the rest', () => {
        for (const count of [0, 5, 9, 10, 20, 25, 100, 105, 200]) {
            expect(branch(count), `${count} should take the other form`).toBe(3);
        }
    });

    it('decides on the last two digits, not the last one', () => {
        // A mod-10 reading would call 111 "one" and 112 "two"; Slovene puts both
        // in "other", because 11 and 12 are there
        expect(branch(11)).toBe(3);
        expect(branch(12)).toBe(3);
        expect(branch(111)).toBe(3);
        expect(branch(112)).toBe(3);
        // While the hundreds themselves carry straight through
        expect(branch(101)).toBe(0);
        expect(branch(102)).toBe(1);
    });

    it('falls back to a plain singular/plural split for a two-branch message', () => {
        expect(slovenePlural(1, 2)).toBe(0);
        expect(slovenePlural(2, 2)).toBe(1);
        expect(slovenePlural(5, 2)).toBe(1);
    });

    it('never picks a branch the message does not have', () => {
        for (let count = 0; count <= 220; count += 1) {
            expect(slovenePlural(count, 4)).toBeLessThan(4);
            expect(slovenePlural(count, 2)).toBeLessThan(2);
        }
    });
});

/**
 * The forms, using "šaltinis" (source) as the example:
 *
 *   0 -> other  1 -> one   2 -> few   9 -> few
 *  10 -> other 11 -> other 19 -> other 21 -> one
 */
describe('lithuanianPlural', () => {
    const branch = (count: number) => lithuanianPlural(count, 3);

    it('uses the "one" form for numbers ending in 1 outside the teens', () => {
        for (const count of [1, 21, 31, 101]) {
            expect(branch(count), `${count} should take the one form`).toBe(0);
        }
    });

    it('runs the "few" form all the way to 9, not just to 4', () => {
        // Where this parts company with the Slavic rule: 5 to 9 are "few" here
        for (const count of [2, 4, 5, 7, 9, 22, 29]) {
            expect(branch(count), `${count} should take the few form`).toBe(1);
        }
    });

    it('gives the whole of 11 to 19 to the "other" form', () => {
        // Not only 11 to 14, as in Russian
        for (const count of [11, 12, 14, 15, 19, 111, 119]) {
            expect(branch(count), `${count} should take the other form`).toBe(2);
        }
    });

    it('uses the "other" form for 0 and for multiples of ten', () => {
        for (const count of [0, 10, 20, 30, 100]) {
            expect(branch(count), `${count} should take the other form`).toBe(2);
        }
    });

    it('falls back to a plain singular/plural split for a two-branch message', () => {
        expect(lithuanianPlural(1, 2)).toBe(0);
        expect(lithuanianPlural(2, 2)).toBe(1);
        expect(lithuanianPlural(5, 2)).toBe(1);
    });

    it('never picks a branch the message does not have', () => {
        for (let count = 0; count <= 220; count += 1) {
            expect(lithuanianPlural(count, 3)).toBeLessThan(3);
            expect(lithuanianPlural(count, 2)).toBeLessThan(2);
        }
    });
});
