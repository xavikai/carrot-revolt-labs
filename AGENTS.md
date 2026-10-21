# Primary lab collection

Carrot Revolt Labs is the source of truth. Implement all new labs, fixes, shared controls, translations and teaching content here, then run `npm test` and push to `main`.

CIFOG Lab is an automatic, one-way mirror until its owner retires it. Do not make independent changes to its mirrored content. Its GitHub Actions workflow reads this repository every five minutes, runs the mirror script and tests, commits changed files and publishes the result to GitHub Pages. Do not store credentials or copy hosting configuration between sites.

`tools/mirror-cifog.mjs` preserves CIFOG branding and browser progress namespaces. When adding a new kind of runtime file, update its managed-file rules and tests. See `docs/automatic-mirror.md` for operation and retirement.
