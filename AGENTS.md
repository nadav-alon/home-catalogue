# home-catalogue

Offline PWA tracking what the household has, is running low on, or is out of, with per-shop Calendar export

Instructions for agents working in this repo. The files below are the conventions this repo is written to; read the one that covers what you are about to do.

## Coding standards

Branded primitives over bare ones, and comments that outlive the review (`TODO[#n]`, never ticket narration). See `docs/agents/coding-standards.md`.

## Issue tracker

Where this repo's issues live and how to drive them. See `docs/agents/issue-tracker.md`.

## Ticket scope

One seam per ticket: acceptance criteria describe behaviors of one seam, never a list of them. See `docs/agents/ticket-scope.md`.

## Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

## Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Apply review

Commenting `/apply-review` on a draft pull request opens a ticket asking an agent to work every open review thread on it. See `.github/workflows/apply-review.yml`.

## Rebase

Commenting `/rebase` on a draft pull request opens a ticket asking an agent to rebase it, and labels the pull request `needs-rebase`. See `.github/workflows/rebase.yml`.

## UX mode

`npm run ux -- --scenario <name>` starts the local Household from `data-platform/local` with the scenario seeded (default `owner-with-items`; an unknown name fails with the known list), then serves the app in the `ux` Vite mode and prints the URL once ready. The port is fixed at **5183** (`UX_PORT` in `scripts/uxArgs.ts`), so the URL is `http://127.0.0.1:5183/home-catalogue/`; the emulators use Auth `9099` and Firestore `8090`. Java must be on the PATH. Not turboable: it is a long-running dev server that holds fixed ports.
