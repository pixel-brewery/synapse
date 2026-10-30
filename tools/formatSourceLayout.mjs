// #region Imports

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { getSourceCommentRanges } from './getSourceCommentRanges.mjs';

// #endregion

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseTag = /^@(public|protected|private|internal)\s*$/u;
const regionTag = /^\/\/\s*#(region|endregion)(?:\s+([^\r\n]+))?\s*$/u;

function parse(path, text) {
    return ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
        path.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS,
    );
}

function applyEdits(text, edits) {
    const ordered = [...edits].sort((left, right) => right.start - left.start);
    let boundary = text.length;

    for (const edit of ordered) {
        if (edit.end > boundary) throw new Error('Overlapping source-layout edits.');

        text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
        boundary = edit.start;
    }

    return text;
}

function lineStart(text, position) {
    return text.lastIndexOf('\n', position - 1) + 1;
}

function lineEnd(text, position) {
    const end = text.indexOf('\n', position);

    return end === -1 ? text.length : end + 1;
}

function removeEmptyRegions(path, text) {
    const source = parse(path, text);
    const comments = getSourceCommentRanges(source);
    const pending = [];
    const edits = [];

    for (const comment of comments) {
        if (comment.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;

        const marker = regionTag.exec(text.slice(comment.pos, comment.end));

        if (!marker) continue;

        if (marker[1] === 'region') {
            pending.push(comment);

            continue;
        }

        const opening = pending.pop();

        if (!opening) continue;

        let content = text.slice(opening.end, comment.pos);

        for (const nested of comments
            .filter((entry) => entry.pos >= opening.end && entry.end <= comment.pos)
            .reverse()) {
            const start = nested.pos - opening.end;
            const end = nested.end - opening.end;

            content = content.slice(0, start) + content.slice(end);
        }

        if (content.trim()) continue;

        for (const empty of [opening, comment]) {
            const start = lineStart(text, empty.pos);
            const end = lineEnd(text, empty.end);
            const standalone = !text.slice(start, empty.pos).trim();

            edits.push({
                start: standalone ? start : empty.pos,
                end: standalone ? end : empty.end,
                value: '',
            });
        }
    }

    return applyEdits(text, edits);
}

function trimBlankLines(lines) {
    const output = [...lines];

    while (output.length && !output[0].trim()) output.shift();

    while (output.length && !output.at(-1).trim()) output.pop();

    return output;
}

function documentationLines(block) {
    const lines = trimBlankLines(
        block
            .slice(3, -2)
            .split(/\r?\n/u)
            .map((line, index) =>
                index === 0 ? line.trimStart().trimEnd() : line.replace(/^[\t ]*\*(?: |$)/u, ''),
            ),
    );
    const description = [];
    const blocks = [];
    let current;
    let fence;

    for (const line of lines) {
        const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);

        if (marker) {
            const character = marker[1][0];
            const length = marker[1].length;

            if (fence) {
                if (character === fence.character && length >= fence.length && !marker[2].trim())
                    fence = undefined;
            } else if (character !== '`' || !marker[2].includes('`')) {
                fence = { character, length };
            }
        }

        if (!fence && /^@[A-Za-z]/u.test(line)) {
            current = [];
            blocks.push(current);
        }

        (current ?? description).push(line);
    }

    const tags = [];
    const access = [];

    for (const blockLines of blocks) {
        const block = trimBlankLines(blockLines);

        if (block.length === 1 && releaseTag.test(block[0])) access.push(block[0]);
        else tags.push(...block);
    }

    const output = trimBlankLines(description);

    if (tags.length) {
        if (output.length) output.push('');

        output.push(...tags);
    }

    if (access.length) {
        if (output.length) output.push('');

        output.push(...access);
    }

    return output;
}

function formatDocumentation(path, text) {
    const source = parse(path, text);
    const edits = [];
    const newline = text.includes('\r\n') ? '\r\n' : '\n';

    for (const comment of getSourceCommentRanges(source)) {
        if (
            comment.kind !== ts.SyntaxKind.MultiLineCommentTrivia ||
            !text.startsWith('/**', comment.pos)
        )
            continue;

        const prefix = text.slice(lineStart(text, comment.pos), comment.pos);
        const indent = /^[\t ]*/u.exec(prefix)[0];
        const lines = documentationLines(text.slice(comment.pos, comment.end));
        let end = comment.end;

        while (/[\t ]/u.test(text[end] ?? '') && end < text.length) end++;

        const followsOnLine = end < text.length && !/[\r\n]/u.test(text[end]);
        const value = [
            `${prefix.trim() ? newline + indent : ''}/**`,
            ...lines.map((line) => `${indent} *${line ? ` ${line}` : ''}`),
            `${indent} */${followsOnLine ? newline + indent : ''}`,
        ].join(newline);

        edits.push({ start: comment.pos, end: followsOnLine ? end : comment.end, value });
    }

    return applyEdits(text, edits);
}

function padLayout(path, text) {
    const source = parse(path, text);
    const comments = getSourceCommentRanges(source);
    const insertions = new Set();
    const newline = text.includes('\r\n') ? '\r\n' : '\n';

    const before = (position) => {
        const start = lineStart(text, position);

        if (start === 0 || text.slice(start, position).trim()) return;

        const previous = text.slice(lineStart(text, start - 1), start).trim();

        if (previous) insertions.add(start);
    };

    const leadingPosition = (node, minimum) => {
        const start = node.getStart(source);
        const leading = comments.filter(
            (comment) =>
                comment.pos >= minimum &&
                comment.end <= start &&
                !text.slice(lineStart(text, comment.pos), comment.pos).trim(),
        );
        const lastRegion = leading.findLastIndex(
            (comment) =>
                comment.kind === ts.SyntaxKind.SingleLineCommentTrivia &&
                regionTag.test(text.slice(comment.pos, comment.end)),
        );

        return leading[lastRegion + 1]?.pos ?? start;
    };

    for (const comment of comments) {
        if (comment.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;

        const marker = regionTag.exec(text.slice(comment.pos, comment.end));

        if (!marker) continue;

        if (marker[1] === 'region') {
            const next = /\S/u.exec(text.slice(comment.end));

            if (next) before(comment.end + next.index);
        } else {
            before(comment.pos);

            const next = /\S/u.exec(text.slice(comment.end));

            if (next && text[comment.end + next.index] !== '}') before(comment.end + next.index);
        }
    }

    const padMembers = (members) => {
        for (let index = 1; index < members.length; index++) {
            const previous = members[index - 1];
            const current = members[index];
            const documented = [previous, current].some((member) =>
                ts.getJSDocCommentsAndTags(member).some(ts.isJSDoc),
            );
            const simpleFields = [previous, current].every(
                (member) => ts.isPropertyDeclaration(member) || ts.isPropertySignature(member),
            );

            if (!simpleFields || documented) before(leadingPosition(current, previous.end));
        }
    };

    const padStatements = (statements) => {
        for (let index = 1; index < statements.length; index++) {
            const previous = statements[index - 1];
            const current = statements[index];
            const position = leadingPosition(current, previous.end);
            const related =
                (ts.isVariableStatement(previous) && ts.isVariableStatement(current)) ||
                (ts.isExpressionStatement(previous) && ts.isExpressionStatement(current)) ||
                (ts.isImportDeclaration(previous) && ts.isImportDeclaration(current)) ||
                (ts.isExportDeclaration(previous) && ts.isExportDeclaration(current));

            if (!related || position !== current.getStart(source)) before(position);
        }
    };

    const visit = (node) => {
        if (
            ts.isClassDeclaration(node) ||
            ts.isClassExpression(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeLiteralNode(node)
        )
            padMembers(node.members);

        if (
            ts.isSourceFile(node) ||
            ts.isBlock(node) ||
            ts.isCaseClause(node) ||
            ts.isDefaultClause(node)
        )
            padStatements(node.statements);

        ts.forEachChild(node, visit);
    };

    visit(source);

    return applyEdits(
        text,
        [...insertions].map((start) => ({ start, end: start, value: newline })),
    );
}

/**
 * Applies Synapse's comment, region and logical-spacing conventions to actual syntax.
 *
 * @param {string} path - Source owner used to choose the TypeScript or JavaScript parser.
 * @param {string} text - Authored source, including literal text that must remain unchanged.
 * @returns {string} Layout-normalized source; horizontal formatting remains with Prettier.
 *
 * @public
 */
export function formatSourceLayout(path, text) {
    return padLayout(path, formatDocumentation(path, removeEmptyRegions(path, text)));
}

async function sourceFiles(directory) {
    const files = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (
            ['node_modules', 'dist', '.nx', '.git', '.yarn', 'artifacts', 'coverage'].includes(
                entry.name,
            )
        )
            continue;

        const path = join(directory, entry.name);

        if (entry.isDirectory() && ['libs', 'apps', 'tools'].includes(entry.name))
            files.push(...(await nestedFiles(path)));
        else if (
            entry.isFile() &&
            /\.(?:ts|mjs)$/u.test(entry.name) &&
            !entry.name.endsWith('.d.ts')
        )
            files.push(path);
    }

    return files.sort();
}

async function nestedFiles(directory) {
    const files = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (['node_modules', 'dist', 'artifacts', 'coverage'].includes(entry.name)) continue;

        const path = join(directory, entry.name);

        if (entry.isDirectory()) files.push(...(await nestedFiles(path)));
        else if (
            entry.isFile() &&
            /\.(?:ts|mjs)$/u.test(entry.name) &&
            !entry.name.endsWith('.d.ts')
        )
            files.push(path);
    }

    return files;
}

async function main() {
    const mode = process.argv[2];

    if (!['--check', '--write'].includes(mode) || process.argv.length !== 3)
        throw new Error('Usage: node tools/formatSourceLayout.mjs --check|--write');

    const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
    const failures = [];
    let changed = 0;
    const files = await sourceFiles(rootDirectory);

    for (const path of files) {
        const original = await readFile(path, 'utf8');
        const formatted = formatSourceLayout(path, original);

        if (original === formatted) continue;

        if (printer.printFile(parse(path, original)) !== printer.printFile(parse(path, formatted)))
            throw new Error(
                `Layout would change executable syntax: ${relative(rootDirectory, path)}`,
            );

        if (mode === '--write') {
            await writeFile(path, formatted);
            changed++;
        } else failures.push(relative(rootDirectory, path));
    }

    if (failures.length) {
        process.stderr.write(`${failures.join('\n')}\nRun yarn format to apply source layout.\n`);
        process.exitCode = 1;
    } else
        process.stdout.write(
            `Source layout ${mode === '--write' ? 'formatted' : 'verified'}: ${files.length} files, ${changed} changed.\n`,
        );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    await main();
