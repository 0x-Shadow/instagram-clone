# Security Policy

## Supported versions

Only the latest `main` branch is supported with security updates.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Email the maintainer or open a
[private security advisory](https://github.com/0x-Shadow/instagram-clone/security/advisories/new)
on this repo. Include:

- what you found and where,
- steps to reproduce (without live secrets),
- what you think the impact is.

You can expect an acknowledgement within 7 days. Once fixed, the change will
be released with credit to the reporter (unless you prefer to stay anonymous).

## Scope notes

- The legacy Firebase / Mapbox credentials from the upstream project were
  removed in the sanitized import. If you find a residual secret anywhere in
  history or docs, report it as above and it will be rotated/purged.
- Never commit keystores, service-account JSON, or `.env` files — see
  `CONTRIBUTING.md`.
