/**
 * Redacts common credential shapes and bounds a normalized progress message.
 *
 * @param value - Untrusted human-readable progress text, never a raw credentials object.
 * @param maxCharacters - Maximum retained characters, default 64000.
 * @returns Redacted and bounded text, with a truncation marker if needed.
 * @remarks This projection supplements explicit safe-field selection; it is not a general secret detector.
 *
 * @public
 */
export function boundedText(value: string, maxCharacters = 64_000): string {
    const redacted = value
        .replace(/\b(?:github_pat_|gh[pousr]_)[a-zA-Z0-9_]{16,}\b/gu, '[redacted]')
        .replace(/\bsk-[a-zA-Z0-9_-]{16,}\b/gu, '[redacted]')
        .replace(
            /((?:api[_-]?key|password|secret|token)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s]+)/giu,
            '$1[redacted]',
        )
        .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/giu, '$1[redacted]')
        .trim();
    const limit = Math.max(0, Number.isFinite(maxCharacters) ? Math.floor(maxCharacters) : 64_000);

    return redacted.length > limit ? `${redacted.slice(0, limit)}\n… output truncated.` : redacted;
}
