# Releasing

## Version source of truth

`version` in `package.json` is the single source of truth. The git tag and npm registry must match it.

Never edit `package.json` version directly. Use `make version-bump-*`.

## End-to-end release flow

### Step 1 — Decide the bump

| Change type | Bump |
|---|---|
| Bug fixes, docs, internal refactors | patch (`0.1.0 → 0.1.1`) |
| New features, new tools, new CLI commands | minor (`0.1.0 → 0.2.0`) |
| Breaking API changes | major (`0.1.0 → 1.0.0`) |

### Step 2 — Bump version and push

```bash
git checkout main && git pull origin main
make version-bump-patch    # or -minor or -major
# Update CHANGELOG.md — add entry for the new version
git add package.json CHANGELOG.md
git commit -m "chore: release v$(make version)"
git push origin main
```

Wait for CI to go green before triggering release.

### Step 3 — Trigger release

#### Primary path: GitHub Actions

1. GitHub → **Actions** tab → **Release** → **Run workflow** → branch `main` → enter version → **Run workflow**.

#### Escape hatch: local publish

```bash
make release        # tag + push (CI publishes)
# or:
make release-npm    # publish directly (no tag)
```

### Step 4 — Verify

```bash
make smoke
```

## Pre-flight gates (`make verify`)

| Gate | Checks |
|---|---|
| G1 | `package.json` version is not `0.0.0` |
| G2 | No uncommitted changes |
| G3 | Current branch is `main` |
| G4 | `v<version>` tag doesn't already exist |

## Recovery

| Failure | Recovery |
|---|---|
| CI red before release | Fix on `main`, re-push, wait for green |
| Publish failed, no tag | `make release-npm` to retry |
| Tag exists but not published | Delete tag, fix, re-release |
| Published version is broken | `make version-bump-patch` → fix → release |
