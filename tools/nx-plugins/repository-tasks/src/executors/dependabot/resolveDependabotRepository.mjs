const repositoryId = 1439526639;
const repositoryPattern = /^[A-Za-z0-9-]+\/synapse$/u;
const branchPattern = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,199}$/u;

/**
 * Resolves Symphony's transferred repository through its immutable GitHub identity.
 *
 * @param context - Trusted workflow repository ID, full name and default branch.
 * @param request - The parsed-JSON GitHub REST request boundary.
 * @returns The verified current repository and branch, or undefined for mismatched metadata.
 * @throws An Error when the supplied API boundary fails.
 * @remarks The numeric ID survives an owner transfer. No owner allowlist or caller-supplied API destination can select another repository.
 *
 * @internal
 */
export async function resolveDependabotRepository(context, request) {
    if (
        ![repositoryId, String(repositoryId)].includes(context?.repositoryId) ||
        typeof context?.repository !== 'string' ||
        typeof context?.defaultBranch !== 'string' ||
        !repositoryPattern.test(context?.repository ?? '') ||
        !branchPattern.test(context?.defaultBranch ?? '') ||
        context.defaultBranch.includes('..')
    )
        return undefined;

    const repository = await request('GET', `repositories/${repositoryId}`);

    if (
        repository?.id !== repositoryId ||
        repository?.name !== 'synapse' ||
        repository?.fork !== false ||
        repository?.full_name !== context.repository ||
        repository?.default_branch !== context.defaultBranch
    )
        return undefined;

    return {
        id: repositoryId,
        fullName: repository.full_name,
        defaultBranch: repository.default_branch,
        path: `repos/${repository.full_name}`,
    };
}
