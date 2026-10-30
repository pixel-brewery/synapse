// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { IMeetingNotes } from './interfaces/IMeetingNotes.js';

// #endregion

/**
 * Decodes the host's meeting-note contract after runtime JSON-schema validation.
 *
 * @param value - Actual structured output from the selected AI execution.
 * @returns Validated host-owned summary, decisions and tasks.
 * @throws An AiError when output does not satisfy the meeting workflow's contract.
 *
 * @internal
 */
export function parseMeetingNotes(value: unknown): IMeetingNotes {
    if (
        !record(value) ||
        typeof value['summary'] !== 'string' ||
        !value['summary'].trim() ||
        !Array.isArray(value['decisions']) ||
        !value['decisions'].every((entry) => typeof entry === 'string') ||
        !Array.isArray(value['tasks'])
    )
        throw new AiError(
            'result-validation',
            'The selected AI returned incomplete meeting notes.',
        );

    const tasks: { readonly description: string; readonly owner?: string }[] = [];

    for (const entry of value['tasks']) {
        if (
            !record(entry) ||
            typeof entry['description'] !== 'string' ||
            !entry['description'].trim() ||
            (entry['owner'] !== undefined &&
                entry['owner'] !== null &&
                typeof entry['owner'] !== 'string')
        )
            throw new AiError(
                'result-validation',
                'The selected AI returned an invalid meeting task.',
            );

        tasks.push({
            description: entry['description'].trim(),
            ...(typeof entry['owner'] === 'string' ? { owner: entry['owner'] } : {}),
        });
    }

    return {
        summary: value['summary'].trim(),
        decisions: value['decisions'].filter((entry): entry is string => typeof entry === 'string'),
        tasks,
    };
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
