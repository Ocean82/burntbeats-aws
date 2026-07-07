# Contributing to Burnt Beats

Thanks for your interest. Burnt Beats is a solo-maintained production app ([burntbeats.com](https://www.burntbeats.com)) with a large monorepo. Contributions are welcome when they are focused and easy to review.

## Good ways to help

- **Bug reports** with repro steps (browser, file type, plan tier)
- **UX copy** improvements on the landing page or onboarding
- **Docs** fixes (README, deploy guides)
- **Small frontend fixes** (accessibility, mobile layout) with screenshots
- **Stem quality feedback** with genre + short audio description (no copyrighted full tracks in issues)

## Before you open a PR

1. Search [existing issues](https://github.com/Ocean82/burntbeats-aws/issues) first.
2. For non-trivial changes, open an issue and wait for a 👍 before large PRs.
3. Keep PRs **small and scoped** — one concern per PR.
4. Run relevant checks locally:
   - Frontend: `cd frontend && npm test`
   - Backend: `cd backend && npm test`
   - Python services: see `docs/BUILD.md`

## Repo map (where to start)

| Area | Path |
|------|------|
| Landing / marketing UI | `frontend/src/components/landing/` |
| Stem split UX | `frontend/src/hooks/useStemSplitting.ts` |
| API routes | `backend/routes/` |
| Stem inference | `stem_service/` |
| Deploy | `docker-compose.yml`, `docs/DEPLOY-DOCKER-EC2.md` |

## What is hard to contribute to

- **Model weights** — not in git; see `docs/MODEL-LAYOUT.md`
- **Billing / auth** — Clerk + Stripe; coordinate before changing
- **Broad refactors** — unlikely to merge without prior discussion

## Code style

Match the surrounding file. TypeScript in `frontend/`, Node in `backend/`, Python in `*_service/`.

## Questions

Open a [Discussion](https://github.com/Ocean82/burntbeats-aws/discussions) or email support@burntbeats.com.
