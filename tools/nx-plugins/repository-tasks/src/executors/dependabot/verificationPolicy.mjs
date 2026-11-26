/**
 * Defines the reviewed CI baseline and complete native verification requirements.
 *
 * @internal
 */
export const verificationPolicy = Object.freeze({
    workflowFile: 'ci.yml',
    workflowPath: '.github/workflows/ci.yml',
    workflowName: 'Verify',
    requiredJobs: [
        'verify (ubuntu-latest)',
        'verify (macos-latest)',
        'verify (windows-latest)',
        'Quality Gate',
    ],
    requiredChecks: [
        'verify (ubuntu-latest)',
        'verify (macos-latest)',
        'verify (windows-latest)',
        'Quality Gate',
    ],
    reviewedCiSha256: '4c89f0236a814878853f712231e790106c574916bdc8b6700e71b799f894f6c9',
});
