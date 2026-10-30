// #region Imports

import { readFile, readdir } from 'node:fs/promises';
import { dirname, basename, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { getSourceCommentRanges } from './getSourceCommentRanges.mjs';

// #endregion

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const has = (node, kind) => node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
const nameOf = (node) =>
    ts.isVariableStatement(node)
        ? (node.declarationList.declarations[0]?.name.getText() ?? 'value')
        : (node.name?.getText() ?? 'constructor');
const isPrivate = (node) =>
    has(node, ts.SyntaxKind.PrivateKeyword) || ts.isPrivateIdentifier(node.name ?? node);
const isFunctionLike = (node) =>
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isCallSignatureDeclaration(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionTypeNode(node);

function checkComment(node, report, requireAccess = false) {
    const signature = ts.isVariableStatement(node)
        ? (node.declarationList.declarations[0]?.initializer ?? node)
        : ts.isPropertySignature(node) && node.type && ts.isFunctionTypeNode(node.type)
          ? node.type
          : node;
    const comments = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);

    if (!comments.length) {
        report(node, `${nameOf(node)} needs public API TSDoc.`);

        return;
    }

    const tags = comments.flatMap((item) => [...(item.tags ?? [])]);
    const tagged = (names, needsDescription = false) =>
        tags.some(
            (tag) =>
                names.includes(tag.tagName.text) &&
                (!needsDescription || ts.getTextOfJSDocComment(tag.comment)?.trim()),
        );
    const summary = comments
        .map((item) => ts.getTextOfJSDocComment(item.comment) ?? '')
        .join('\n')
        .trim();

    // TypeDoc resolves the actual inherited reference and its complete contract.
    if (tagged(['inheritDoc']) || /^\{@inheritDoc\s+[^}]+\}$/u.test(summary)) return;

    if (
        !summary ||
        summary.toLowerCase().replace(/\W/gu, '') === nameOf(node).toLowerCase().replace(/\W/gu, '')
    ) {
        report(node, `${nameOf(node)} needs a meaningful consumer-facing TSDoc summary.`);
    }

    if (requireAccess && !tagged(['public', 'protected', 'internal']))
        report(node, `${nameOf(node)} needs a TSDoc access/release tag.`);

    if (isFunctionLike(signature)) {
        for (const parameter of signature.parameters ?? []) {
            if (!ts.isIdentifier(parameter.name)) {
                report(parameter, 'Public parameters must have documentable names.');

                continue;
            }

            if (
                !tags.some(
                    (tag) =>
                        ts.isJSDocParameterTag(tag) &&
                        tag.name.getText() === parameter.name.text &&
                        ts.getTextOfJSDocComment(tag.comment)?.trim(),
                )
            ) {
                report(parameter, `Document @param ${parameter.name.text} with its meaning.`);
            }
        }

        const returnType = signature.type?.getText();

        if (!ts.isConstructorDeclaration(signature) && !returnType)
            report(node, 'Public callable APIs need explicit return types.');

        if (
            !ts.isConstructorDeclaration(signature) &&
            returnType &&
            !/^(?:void|never|Promise<void>)$/u.test(returnType) &&
            !tagged(['return', 'returns'], true)
        ) {
            report(node, `${nameOf(node)} needs @returns describing the result.`);
        }

        let throws = false;
        const inspect = (child) => {
            if (ts.isThrowStatement(child)) throws = true;

            if (
                child !== node &&
                (ts.isFunctionDeclaration(child) ||
                    ts.isArrowFunction(child) ||
                    ts.isFunctionExpression(child))
            )
                return;

            ts.forEachChild(child, inspect);
        };

        if (signature.body) inspect(signature.body);

        if (throws && !tagged(['throws'], true))
            report(node, `${nameOf(node)} needs @throws for its explicit failure behavior.`);
    }

    for (const parameter of signature.typeParameters ?? []) {
        const escaped = parameter.name.text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

        if (
            !tags.some(
                (tag) =>
                    tag.tagName.text === 'typeParam' &&
                    new RegExp(`^${escaped}\\s+\\S`, 'u').test(
                        ts.getTextOfJSDocComment(tag.comment) ?? '',
                    ),
            )
        )
            report(parameter, `Document @typeParam ${parameter.name.text}.`);
    }
}

function regionMarkers(source, comments, owns, reportAt) {
    return comments.flatMap((comment) => {
        if (comment.kind !== ts.SyntaxKind.SingleLineCommentTrivia || !owns(comment)) return [];

        const text = source.text.slice(comment.pos, comment.end);
        const match = /^\/\/[ \t]*#(region|endregion)(?:[ \t]+([^\r\n]*))?$/u.exec(text);

        if (!match) return [];

        const line = source.getLineAndCharacterOfPosition(comment.pos).line;
        const lineStart = source.getLineStarts()[line];

        if (source.text.slice(lineStart, comment.pos).trim())
            reportAt(comment.pos, 'Region markers must occupy their own comment line.');

        return [{ ...comment, type: match[1], name: match[2]?.trim(), line }];
    });
}

function pairRegions(markers, reportAt, owner) {
    const stack = [];
    const regions = [];

    for (const marker of markers) {
        if (marker.type === 'region') {
            if (stack.length)
                reportAt(marker.pos, `${owner} regions must be balanced and nonnested.`);

            stack.push({ open: marker, name: marker.name, depth: stack.length });

            continue;
        }

        const region = stack.pop();

        if (!region) {
            reportAt(marker.pos, `${owner} regions must be balanced and nonnested.`);

            continue;
        }

        if (marker.name && marker.name !== region.name)
            reportAt(marker.pos, 'A named region closure must match its opening.');

        regions.push({ ...region, close: marker });
    }

    for (const region of stack)
        reportAt(region.open.pos, `${owner} regions must be balanced and nonnested.`);

    return regions.sort((left, right) => left.open.pos - right.open.pos);
}

function blankLine(source, number) {
    const starts = source.getLineStarts();

    return (
        number >= 0 &&
        number < starts.length &&
        !source.text.slice(starts[number], starts[number + 1] ?? source.text.length).trim()
    );
}

function checkRegionPadding(source, regions, reportAt) {
    const topLevel = regions.filter((region) => region.depth === 0);

    for (const region of regions) {
        if (!blankLine(source, region.open.line + 1) || blankLine(source, region.open.line + 2))
            reportAt(region.open.pos, 'Use one blank line after a region opening.');

        if (!blankLine(source, region.close.line - 1) || blankLine(source, region.close.line - 2))
            reportAt(region.close.pos, 'Use one blank line before a region closure.');
    }

    for (let index = 1; index < topLevel.length; index++) {
        const previous = topLevel[index - 1];
        const current = topLevel[index];

        if (
            current.open.line !== previous.close.line + 2 ||
            !blankLine(source, previous.close.line + 1)
        )
            reportAt(current.open.pos, 'Separate regions with one blank line.');
    }
}

function checkImports(source, comments, report, reportAt) {
    const imports = source.statements.filter(
        (statement) => ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement),
    );
    const markers = regionMarkers(
        source,
        comments,
        (comment) =>
            !source.statements.some(
                (statement) =>
                    statement.getStart(source) <= comment.pos && comment.end <= statement.end,
            ),
        reportAt,
    );
    const regions = pairRegions(markers, reportAt, 'File');

    for (const marker of markers)
        if (marker.type === 'region' && marker.name !== 'Imports')
            reportAt(marker.pos, 'Only Imports regions belong at file scope.');

    for (const region of regions)
        if (
            !imports.some(
                (statement) =>
                    statement.getStart(source) >= region.open.end &&
                    statement.end <= region.close.pos,
            )
        )
            reportAt(region.open.pos, 'Imports regions must contain actual imports.');

    checkRegionPadding(source, regions, reportAt);

    if (!imports.length) return;

    const wrapper = regions.length === 1 ? regions[0] : undefined;

    if (
        !wrapper ||
        wrapper.name !== 'Imports' ||
        wrapper.open.end > imports[0].getStart(source) ||
        wrapper.close.pos < imports.at(-1).end ||
        source.statements.some(
            (statement) =>
                !imports.includes(statement) &&
                statement.getStart(source) >= wrapper.open.end &&
                statement.end <= wrapper.close.pos,
        )
    )
        report(imports[0], 'Wrap the contiguous top import block in Imports regions.');

    if (
        source.statements.indexOf(imports[0]) !== 0 ||
        source.statements.slice(0, imports.length).some((statement) => !imports.includes(statement))
    )
        report(imports[0], 'Imports must form the first contiguous declaration block.');
}

function checkClass(node, report, source, comments, reportAt, publicApi = true) {
    const members = node.members.filter((member) => !ts.isSemicolonClassElement(member));
    const bodyEnd = node.getLastToken(source)?.getStart(source) ?? node.end;
    const markers = regionMarkers(
        source,
        comments,
        (comment) =>
            comment.pos >= node.members.pos &&
            comment.end <= bodyEnd &&
            !members.some(
                (member) => member.getStart(source) <= comment.pos && comment.end <= member.end,
            ),
        reportAt,
    );
    const regions = pairRegions(markers, reportAt, 'Class');
    const names = ['Fields', 'Ctor', 'Properties', 'Methods'];
    let previousRegion = -1;

    for (const marker of markers) {
        if (marker.type !== 'region') continue;

        const rank = names.indexOf(marker.name);

        if (rank < 0 || rank <= previousRegion)
            reportAt(
                marker.pos,
                'Class regions must follow Fields, Ctor, Properties, Methods without duplicates.',
            );

        previousRegion = Math.max(rank, previousRegion);
    }

    for (const region of regions)
        if (
            !members.some(
                (member) =>
                    member.getStart(source) >= region.open.end && member.end <= region.close.pos,
            )
        )
            reportAt(
                region.open.pos,
                'A class region must contain a class member; omit empty regions.',
            );

    checkRegionPadding(source, regions, reportAt);

    const previousRanks = new Map();

    for (const member of members) {
        const privateMember = isPrivate(member);

        if (
            !has(member, ts.SyntaxKind.PublicKeyword) &&
            !has(member, ts.SyntaxKind.ProtectedKeyword) &&
            !has(member, ts.SyntaxKind.PrivateKeyword) &&
            !ts.isIndexSignatureDeclaration(member)
        ) {
            report(member, 'Class members need explicit visibility.');
        }

        if (privateMember && ts.isPropertyDeclaration(member) && !nameOf(member).startsWith('_'))
            report(member, 'Private fields need an underscore prefix.');

        if (privateMember && ts.isMethodDeclaration(member) && nameOf(member).startsWith('_'))
            report(member, 'Private methods do not use underscore prefixes.');

        if (!privateMember && publicApi) checkComment(member, report, true);

        if (ts.isConstructorDeclaration(member)) {
            for (const parameter of member.parameters) {
                if (
                    has(parameter, ts.SyntaxKind.PrivateKeyword) &&
                    !nameOf(parameter).startsWith('_')
                )
                    report(parameter, 'Private constructor fields need an underscore prefix.');
            }
        }

        const wanted = ts.isConstructorDeclaration(member)
            ? 'Ctor'
            : ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)
              ? 'Properties'
              : ts.isMethodDeclaration(member)
                ? 'Methods'
                : 'Fields';
        const active = regions.find(
            (region) =>
                region.depth === 0 &&
                member.getStart(source) >= region.open.end &&
                member.end <= region.close.pos,
        );

        if (active?.name !== wanted)
            report(member, `${nameOf(member)} belongs in the ${wanted} region.`);

        const rank =
            (privateMember ? 4 : has(member, ts.SyntaxKind.ProtectedKeyword) ? 2 : 0) +
            (has(member, ts.SyntaxKind.StaticKeyword) ? 0 : 1);

        if ((previousRanks.get(wanted) ?? -1) > rank)
            report(
                member,
                'Order public, protected, private members; static before instance within each visibility.',
            );

        previousRanks.set(wanted, rank);
    }
}

/**
 * Check source structure and the public contracts owned by production library files.
 *
 * @param path - Repository-relative owner; specs and executable app sources use structural checks.
 * @param text - Actual source content; quoted fixtures are not inspected as source.
 * @returns Located source and API-contract failures without changing files.
 *
 * @public
 */
export function inspectSource(path, text) {
    const failures = [];
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const reportAt = (position, message) =>
        failures.push(
            `${path}:${source.getLineAndCharacterOfPosition(position).line + 1}: ${message}`,
        );
    const report = (node, message) => reportAt(node.getStart(source), message);
    const comments = getSourceCommentRanges(source);

    checkImports(source, comments, report, reportAt);

    const normalizedPath = path.replaceAll('\\', '/');
    const structureOnly =
        normalizedPath.endsWith('.spec.ts') || /^apps\/[^/]+\/src\//u.test(normalizedPath);

    if (structureOnly) {
        const visit = (node) => {
            if (ts.isClassDeclaration(node) || ts.isClassExpression(node))
                checkClass(node, report, source, comments, reportAt, false);

            ts.forEachChild(node, visit);
        };

        visit(source);

        return failures;
    }

    if (normalizedPath.includes('/ports/'))
        failures.push(`${path}:1: Use abstract bases and interfaces, not ports/ folders.`);

    const publicNames = new Set(
        source.statements
            .filter(
                (statement) =>
                    ts.isExportDeclaration(statement) &&
                    !statement.moduleSpecifier &&
                    statement.exportClause &&
                    ts.isNamedExports(statement.exportClause),
            )
            .flatMap((statement) =>
                statement.exportClause.elements.map(
                    (element) => (element.propertyName ?? element.name).text,
                ),
            ),
    );
    const exported = source.statements.filter(
        (statement) =>
            !ts.isExportDeclaration(statement) &&
            (has(statement, ts.SyntaxKind.ExportKeyword) ||
                (ts.isVariableStatement(statement)
                    ? statement.declarationList.declarations.some((declaration) =>
                          publicNames.has(declaration.name.getText(source)),
                      )
                    : statement.name && publicNames.has(statement.name.getText(source)))),
    );

    if (basename(path) !== 'index.ts') {
        const schema = exported.find(ts.isVariableStatement);
        const alias = exported.find(ts.isTypeAliasDeclaration);
        const schemaName = schema?.declarationList.declarations[0]?.name.getText(source);
        const inferredType = alias?.type.getText(source);
        const schemaPair =
            exported.length === 2 &&
            schema?.declarationList.declarations.length === 1 &&
            schemaName &&
            inferredType &&
            inferredType.includes(`typeof ${schemaName}`) &&
            /(?:infer|Infer|Output|Input|Static)\b/u.test(inferredType);

        if (schemaPair && basename(path, '.ts') !== schemaName)
            report(schema, `${schemaName} must own ${schemaName}.ts.`);

        if (exported.length > 1 && !schemaPair)
            report(
                exported[1],
                'One public declaration per file (except cohesive schema/inferred type).',
            );

        for (const declaration of exported) {
            const name = ts.isVariableStatement(declaration)
                ? declaration.declarationList.declarations[0]?.name.getText(source)
                : declaration.name?.getText(source);

            if (name && name !== basename(path, '.ts') && !schemaPair)
                report(declaration, `${name} must own ${name}.ts.`);
        }
    } else if (exported.length)
        report(exported[0], 'index.ts is an explicit export barrel, not an implementation file.');

    for (const declaration of exported) {
        checkComment(declaration, report, true);

        if (
            ts.isVariableStatement(declaration) &&
            declaration.declarationList.declarations.length > 1
        )
            report(declaration, 'Public constants need individual declaration files.');

        if (
            ts.isInterfaceDeclaration(declaration) &&
            (!declaration.name.text.startsWith('I') ||
                !path.replaceAll('\\', '/').includes('/interfaces/'))
        )
            report(declaration, 'I-prefixed interfaces belong under interfaces/.');

        if (ts.isClassDeclaration(declaration)) {
            if (
                has(declaration, ts.SyntaxKind.AbstractKeyword) &&
                (!declaration.name?.text.endsWith('Base') ||
                    !path.replaceAll('\\', '/').includes('/abstracts/'))
            )
                report(declaration, 'Abstract classes end in Base and belong under abstracts/.');

            if (declaration.name?.text.endsWith('Port'))
                report(declaration, 'Do not introduce Port classes.');
        }

        if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) {
            const visit = (node) => {
                if (
                    ts.isPropertySignature(node) ||
                    ts.isMethodSignature(node) ||
                    ts.isCallSignatureDeclaration(node) ||
                    ts.isConstructSignatureDeclaration(node)
                )
                    checkComment(node, report);

                ts.forEachChild(node, visit);
            };

            ts.forEachChild(declaration, visit);
        }

        if (ts.isEnumDeclaration(declaration))
            for (const member of declaration.members) checkComment(member, report);
    }

    const owner = normalizedPath.match(/(?:^|\/)(libs\/synapse-[^/]+)\/src(?:\/|$)/u)?.[1];
    const dependency = (node, value) => {
        if (value.startsWith('.') && !/\.(?:js|json)$/u.test(value))
            report(node, 'Relative ESM runtime imports need .js extensions.');

        const destination = value.startsWith('.')
            ? posix
                  .normalize(posix.join(posix.dirname(normalizedPath), value))
                  .match(/(?:^|\/)(libs\/synapse-[^/]+)\/src(?:\/|$)/u)?.[1]
            : value.startsWith('@pixel-brewery/synapse-')
              ? `libs/${value.slice('@pixel-brewery/'.length).split('/')[0]}`
              : undefined;

        if (value.startsWith('.') && destination && destination !== owner)
            report(
                node,
                'Cross-package relative imports are forbidden; use declared package exports.',
            );

        if (owner === 'libs/synapse-core' && !value.startsWith('.'))
            report(node, 'Core must remain Node-free and dependency-free.');

        if (destination?.startsWith('libs/synapse-provider-')) {
            if (owner && !owner.startsWith('libs/synapse-provider-'))
                report(node, 'Provider-neutral packages cannot import concrete drivers.');

            if (owner?.startsWith('libs/synapse-provider-') && owner !== destination)
                report(node, 'Concrete providers cannot depend on other provider implementations.');
        }
    };
    const visit = (node) => {
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node))
            checkClass(node, report, source, comments, reportAt, exported.includes(node));

        if (node.kind === ts.SyntaxKind.AnyKeyword)
            report(node, 'Use unknown and validate instead of any.');

        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        )
            dependency(node, node.moduleSpecifier.text);

        if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments[0] &&
            ts.isStringLiteralLike(node.arguments[0])
        )
            dependency(node, node.arguments[0].text);

        if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)
        )
            dependency(node, node.argument.literal.text);

        if (
            owner === 'libs/synapse-core' &&
            ts.isIdentifier(node) &&
            ['process', 'Buffer', 'require', '__dirname', '__filename'].includes(node.text)
        ) {
            const propertyName =
                (ts.isPropertyAccessExpression(node.parent) &&
                    node.parent.name === node &&
                    node.parent.expression.getText(source) !== 'globalThis') ||
                (ts.isPropertySignature(node.parent) && node.parent.name === node);

            if (!propertyName)
                report(node, 'Core must not access Node.js globals or ambient environment.');
        }

        ts.forEachChild(node, visit);
    };

    visit(source);

    return failures;
}

async function sourceFiles(directory) {
    const output = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        if (entry.isDirectory()) output.push(...(await sourceFiles(path)));
        else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts'))
            output.push(path);
    }

    return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const failures = [];
    let count = 0;

    for (const category of ['libs', 'apps', 'tools']) {
        for (const entry of await readdir(join(rootDirectory, category), { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;

            if (category === 'tools' && entry.name !== 'mcp') continue;

            const files = await sourceFiles(join(rootDirectory, category, entry.name, 'src'));

            for (const path of files) {
                if (
                    path.endsWith('.spec.ts') &&
                    !files.includes(path.replace(/\.spec\.ts$/u, '.ts'))
                )
                    failures.push(
                        `${relative(rootDirectory, path)}:1: Spec must sit beside its exact production owner.`,
                    );

                failures.push(
                    ...inspectSource(relative(rootDirectory, path), await readFile(path, 'utf8')),
                );
                count++;
            }
        }
    }

    if (failures.length) {
        process.stderr.write(`${failures.join('\n')}\n`);
        process.exitCode = 1;
    } else
        process.stdout.write(
            `Source structure and library public TSDoc rules pass (${count} files).\n`,
        );
}
