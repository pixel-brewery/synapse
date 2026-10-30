# Reporting a security issue

Synapse runs installed CLIs with the permissions and account configuration supplied by a host application. Reports about executable handling, profile/account isolation, session binding, credential handling or process cleanup are relevant here. Provider-service or native-CLI vulnerabilities should also be reported through that provider's own reporting process when applicable.

## Private reports

A private reporting channel has not been established by this repository setup. GitHub private vulnerability reporting is controlled by repository owners and must be enabled in the repository's security settings; adding this file does not enable it.

If the repository's **Security** tab offers **Report a vulnerability**, use that private GitHub channel. Include the affected package/version or revision, operating system, Node.js and relevant CLI versions, the affected boundary and a minimal synthetic reproduction. Describe the expected behavior and impact without including actual credentials or customer data.

Until a private channel is available, do not post exploit details, tokens, authentication links, native credential files or private prompts/transcripts in public issues, pull requests or logs. A public issue may ask maintainers to enable a private reporting channel without disclosing the finding itself. No alternative address or response-time commitment is designated here.

## Scope and release status

The package family is being prepared for its first public release. The version in a local manifest and a successful build are not evidence of a published or supported release. No historical-version support commitment is currently defined; report the exact revision or installed version so maintainers can establish the affected scope.

Normal CI uses controlled subprocesses and sanitized fixtures without personal AI accounts. It exercises specific boundaries; it is not a blanket security guarantee. Public release evidence and platform verification are described in the [release guide](.docs/guides/releases.md).
