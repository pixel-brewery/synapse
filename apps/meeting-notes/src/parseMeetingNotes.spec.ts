// #region Imports

import { describe, expect, it } from 'vitest';
import { parseMeetingNotes } from './parseMeetingNotes.js';

// #endregion

describe('parseMeetingNotes', () => {
    it('keeps an explicitly unknown owner unassigned', () => {
        // Arrange
        const value = {
            summary: 'Summary',
            decisions: [],
            tasks: [{ description: 'Run tests', owner: null }],
        };

        // Act
        const notes = parseMeetingNotes(value);

        // Assert
        expect(notes.tasks).toEqual([{ description: 'Run tests' }]);
    });

    it('retains only the host-owned meeting-note fields', () => {
        // Arrange
        const value = {
            summary: ' Summary ',
            decisions: ['Proceed'],
            tasks: [{ description: ' Run tests ', owner: 'Mira' }],
        };

        // Act
        const notes = parseMeetingNotes(value);

        // Assert
        expect(notes).toEqual({
            summary: 'Summary',
            decisions: ['Proceed'],
            tasks: [{ description: 'Run tests', owner: 'Mira' }],
        });
    });
    it('rejects malformed structured tasks rather than presenting invented assignments', () => {
        // Arrange
        const value = {
            summary: 'Summary',
            decisions: [],
            tasks: [{ description: 'Run tests', owner: 4 }],
        };

        // Act / Assert
        expect(() => parseMeetingNotes(value)).toThrow('invalid meeting task');
    });
});
