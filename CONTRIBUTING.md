# Contributing

Thanks for stopping by. This repo welcomes pull requests — small, focused ones
get merged fastest.

## How to contribute

1. **Open an issue first** for anything bigger than a typo, so we can agree on
   scope before you write code.
2. Fork the repo, create a branch from `main`:
   `git checkout -b feat/short-description`.
3. Make your change. Follow the existing code style (TypeScript strict in
   `expo-app/`, ESLint/Prettier in the legacy app).
4. Add or update tests where it makes sense:
   - `expo-app/`: `node scripts/check.mjs` must pass, `npx tsc --noEmit`
     must be clean.
   - legacy app: `yarn test` / `yarn lint` where applicable.
5. Update docs (`README.md`, `docs/ROADMAP.md`) if behavior changes.
6. Open a PR using the template. Link the issue. Keep the diff reviewable —
   one concern per PR.

## Secrets

Never commit API keys, keystores, `google-services.json`,
`GoogleService-Info.plist`, or `.env` files. Use the placeholders in
`.env.example` and your own local config. PRs containing secrets will be
closed without review.

## Code of conduct

Be kind and professional. See `CODE_OF_CONDUCT.md`. Maintainers may remove
contributions or comments that violate it.
