---
name: sync-branches
description: >-
  Synchronize this project's git branches and enforce its branching workflow:
  main is production, develop is integration, and all work happens on feature
  branches cut from develop. Use this skill WHENEVER the user wants to sync,
  merge, promote, ship, release, or "clean up" branches — e.g. "sync main and
  develop", "merge my work", "promote develop to main", "ship this", "open a
  PR", "I'm done with this feature", "get everything in order", or even just a
  bare "/sync-branches". Also trigger it proactively when the user has finished
  a chunk of work and asks "what now?" or wants their commits landed. It
  inspects the whole repo state (uncommitted changes, unpushed commits,
  ahead/behind counts), moves stray work onto a proper feature branch when
  needed, creates and merges pull requests, keeps develop and main in sync, and
  tags releases.
---

# Sync Branches

This skill keeps the repository's branches healthy and enforces the project's
branching model. It is the one place that knows "where work is supposed to go,"
so the user never has to remember the git incantations.

## The branching model (the rules this skill protects)

- **`main` is production.** It only ever receives changes by promoting
  `develop` through a pull request. Nobody commits to `main` directly, and it is
  never force-pushed. Treat anything on `main` as live.
- **`develop` is the integration branch.** It accumulates finished features and
  is what we promote to `main` when we cut a release.
- **All real work happens on feature branches cut from `develop`** — named
  `feature/<short-description>` (e.g. `feature/spin-throw-physics`). Work is
  merged back into `develop` via a squashed pull request, so each feature lands
  as one clean commit.

Why this shape: `main` stays deployable at all times, `develop` is where things
come together and can be a little messy, and feature branches isolate
in-progress work so a half-finished idea never blocks a release. When in doubt,
protect `main` — that is the invariant that matters most.

## Merge strategy (decided for this project)

- **feature → develop: squash merge**, deleting the feature branch afterward.
  Keeps `develop`'s history one-commit-per-feature and easy to read or revert.
- **develop → main: merge commit** (no squash), so each release is a visible
  point in `main`'s history. Tag it with a semver version (see Releases).

## How to run this skill

The whole job is: **figure out the current state, then take the smallest set of
actions that gets the repo back to the model above.** Don't blindly run a fixed
script — assess first, then act, and confirm anything irreversible.

### Step 1 — Assess the state

Run these (from the repo root) to build a picture before doing anything:

```bash
git fetch origin --prune                      # get the truth from the remote
git rev-parse --abbrev-ref HEAD               # what branch are we on
git status --porcelain                        # uncommitted/untracked changes?
git log --oneline -5                          # recent local commits
git rev-list --left-right --count origin/develop...develop 2>/dev/null  # develop unpushed/behind
git rev-list --left-right --count main...develop 2>/dev/null            # how far develop leads/trails main
git tag --list 'v*' --sort=-v:refname | head -1                         # latest release tag
gh pr list --state open                        # any PRs already open?
```

If `git fetch` fails because the remote is empty (a brand-new repo with nothing
pushed), that's expected — see "First push" below.

From this, classify the situation. The common cases:

| What you see | What it means | Go to |
|---|---|---|
| Remote has no commits yet | Repo never pushed | First push |
| Uncommitted changes while on `main` or `develop` | Work started in the wrong place | Relocate work |
| A `feature/*` branch with commits not in `develop` | Finished feature to land | Land a feature |
| `develop` is ahead of `main` | Release ready to promote | Releases |
| `main` is ahead of `develop` | A hotfix landed on main | Back-merge |
| Everything pushed, nothing ahead/behind | Already in sync | Report and stop |

Several can be true at once (e.g. uncommitted work *and* develop ahead of main).
Handle them in a sensible order: secure uncommitted work first, land features,
then promote releases, then back-merge.

### Step 2 — Act on each case

**First push** (empty remote). Push both branches and set their upstreams so
future syncs work normally:

```bash
git push -u origin main
git push -u origin develop
```

**Relocate work** (uncommitted changes on `main` or `develop`). Work should
never start on these branches. Move the changes onto a fresh feature branch cut
from `develop` without losing anything:

```bash
git stash --include-untracked            # park the changes
git checkout develop && git pull --ff-only
git checkout -b feature/<short-description>   # name it for what the work is
git stash pop                             # bring the changes back, now on the feature branch
```

Pick `<short-description>` from what the work actually is; ask the user if it
isn't obvious. Then continue to "Land a feature" once they're ready, or just
leave them on the feature branch to keep working — tell them which.

**Land a feature** (a `feature/*` branch with finished work). Commit anything
outstanding, push, open a PR into `develop`, and squash-merge it:

```bash
git add -A && git commit -m "<clear message>"   # only if there are uncommitted changes
git push -u origin HEAD
gh pr create --base develop --head "$(git branch --show-current)" \
  --title "<feature title>" --body "<what changed and why>"
gh pr merge --squash --delete-branch            # confirm with the user first
git checkout develop && git pull --ff-only      # sync the local develop
```

After merging, the local feature branch can be deleted (`git branch -d
feature/...`) since its work now lives in `develop`.

**Back-merge** (`main` ahead of `develop`, e.g. after a hotfix on main). Bring
those commits into `develop` so it doesn't fall behind production:

```bash
git checkout develop && git pull --ff-only
git merge origin/main
git push
```

### Releases — promoting `develop` to `main`

This puts code into production, so **always confirm with the user before
merging to `main`.** Open a PR from `develop` into `main`, merge it as a merge
commit, then tag the release:

```bash
gh pr create --base main --head develop \
  --title "Release <version>" --body "<summary of what's shipping>"
gh pr merge --merge                       # confirm first; do NOT squash main releases
git checkout main && git pull --ff-only
git tag -a <version> -m "Release <version>"
git push origin <version>
git checkout develop && git merge origin/main && git push   # keep develop level with main
```

**Choosing `<version>`:** read the latest `v*` tag. If none exists, start at
`v0.1.0`. Otherwise bump the **minor** version for a normal release
(`v0.1.0` → `v0.2.0`) and the **patch** version for a small fix-only promotion
(`v0.2.0` → `v0.2.1`). If the user signals a big/stable milestone, bump
**major** (`v0.x` → `v1.0.0`). When unsure which, ask.

### Step 3 — Report

Finish by telling the user, in plain terms: what state the repo was in, what you
did (branches created, PRs opened/merged with their URLs, tags pushed), and
where things stand now (current branch, what's in sync). Link PRs as full URLs.

## Safety rules

- Never commit directly to `main`, and never force-push `main` or `develop`.
- Confirm before merging any PR into `main` and before pushing tags — these are
  the production-facing, hard-to-undo actions.
- Prefer `git pull --ff-only` so a surprising divergence surfaces as an error
  instead of an accidental merge commit. If it fails, stop and investigate.
- Never discard uncommitted work to make an operation succeed. Stash it, commit
  it, or ask — but don't throw it away.
- If a PR can't merge due to conflicts, don't force it. Surface the conflict to
  the user and resolve it on the feature branch (or in `develop` for a release).

## Example

**Input:** "I just finished the spin mechanic, sync everything up."

**What the skill does:**
1. Assesses: user is on `main` with uncommitted changes; develop == main.
2. Relocates the work onto `feature/spin-mechanic` cut from `develop`.
3. Commits, pushes, opens a PR into `develop`, and (after confirming)
   squash-merges it — develop now leads main by one commit.
4. Asks whether to release. If yes: opens a `develop → main` PR, merges it,
   tags `v0.1.0`, and levels develop back up with main.
5. Reports the feature PR URL, the release PR URL, and the new tag.
