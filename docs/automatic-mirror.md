# Automatic Carrot → CIFOG mirror

All new content and fixes belong in [Carrot Revolt Labs](https://github.com/xavikai/carrot-revolt-labs), branch `main`. CIFOG is a temporary one-way mirror; changes there do not flow back to Carrot.

## Operation

1. Implement and test the change in Carrot; push to `main`.
2. Netlify tests and publishes Carrot automatically at https://carrotrevoltstudio.com.
3. CIFOG's `Mirror Carrot Revolt Labs` GitHub Actions workflow checks the public source every five minutes. GitHub may delay scheduled runs, so five minutes is a polling interval, not a publication deadline.
4. The workflow copies the current tracked labs, assets, vendor dependencies, shared runtime files, teaching notes, tests, tools and package configuration. It runs both test suites, then commits and deploys CIFOG to https://xavikai.github.io/cifog-lab/.

The mirror adapts branding, URLs and browser-storage namespaces. Existing student progress keeps the CIFOG prefix. Binary assets are copied unchanged. `.github/`, `AGENTS.md`, README, credentials and hosting settings remain specific to each repository. `tools/mirror-cifog.mjs` and its regression tests are maintained in Carrot and copied verbatim.

`.cifog-mirror.json` records the exact source commit and managed files. Subsequent source deletions remove only files recorded in that manifest; unrelated files are preserved. An unchanged source produces no extra commits or publication. No cross-repository write token or personal access token is stored: the workflow reads public Carrot content and uses CIFOG's short-lived `GITHUB_TOKEN` to update and deploy CIFOG.

The Actions workflow can also be run manually from CIFOG's Actions tab (`workflow_dispatch`) for an immediate check. Failures appear in the workflow run and follow the repository owner's GitHub notification settings. A failed test prevents the mirror commit and deployment.

## Adding file types

Update `isManaged` in `tools/mirror-cifog.mjs` when adding a runtime file outside the existing directories or root HTML/CSS/JS files. Update the public-file packaging rules in the CIFOG workflow for a new root runtime extension. Keep infrastructure and credentials outside the mirrored set. Run `npm test`, including the mirror regression tests, before pushing.

## Retiring CIFOG

Once the owner explicitly requests retirement, disable or remove CIFOG's `mirror-carrot.yml` workflow before deleting or archiving the repository or changing its hosting. Carrot has no dependency on CIFOG and continues working. The workflow can be disabled independently without changing any lab. Redirects and deletion require a separate owner instruction.
