# Security policy

## Supported versions

Until the first stable release, security fixes are applied to the latest commit on the default branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing exploit details, credentials, private media paths, or personal data.

## Deployment threat model

- Open EasyX v1 has no multi-user authentication. Keep it on a private LAN or behind an authenticated reverse proxy.
- External plugins are trusted code with the same operating-system permissions as Open EasyX. Review their complete source and pin versions.
- Mount the external plugin directory read-only.
- Protect `data/`: it contains plugin settings and may contain API keys.
- Protect `media/` and its backups as sensitive personal data.
- Do not grant the container access to the Docker socket.
- Use separate, least-privilege credentials for plugins whenever a source supports them.
- Do not configure plugins that bypass access controls or acquire content without authorization.

Future releases are expected to add signed registries, permissions, worker isolation, authentication, and audit logging. Until then, network isolation and plugin review are mandatory controls.
