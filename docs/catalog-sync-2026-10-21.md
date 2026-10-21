# Catalog synchronization — 2026-10-21

Both collections now expose the same 45 active labs, while retaining their own branding, URLs and browser progress keys. Carrot Revolt Labs is the primary collection for future development. CIFOG Lab remains available until its owner decides to retire it.

## Versions reviewed

- CIFOG `de4e2d2`: includes the newest Geometry Nodes and Texel Density work, the NLA and LOD & Mipmaps labs, and iframe controls.
- Carrot Revolt `26deb2f`: already includes the shared CIFOG updates and additionally provides five 3ds Max labs and nine ComfyUI labs. The remaining differences in shared lab logic were branding and storage keys; the C# string exercise uses `CARROT` with six characters and matching answers/translations on both sites.
- The original Carrot checkout also contained newer, uncommitted CAT Rig work and its tests. Those files were copied into an isolated checkout and synchronized to both sites without editing the original working files. This includes the new `rig-geometry.js` dependency and shared Max viewport changes.
- The public Carrot domain, https://carrotrevoltstudio.com, was still serving Netlify deployment `82d4dda` from October 4, despite newer source commits. Source synchronization alone did not update that deployment.

## Result

- CIFOG gains all five 3ds Max labs, all nine ComfyUI labs, their assets, shared components and tests.
- Both home pages show the same catalog, area grouping, translations and roadmap. Existing lab routes and the legacy ComfyUI redirects are retained.
- Every active lab loads the iframe controls and styles, including CAT Rig. Embeds support a collapsible wrapper, custom colors and a clean embedded view.
- Shared lab implementations, assets and tests match apart from site identity and storage namespaces. Storage namespaces remain site-specific to preserve existing progress.

## Verification

The existing 416 tests pass in each checkout. Two added catalog tests check that every active lab appears exactly once and loads iframe controls and styles. Browser checks cover the 45-card home page, the CAT Rig iframe dialog and the embedded CAT Rig with a custom theme and no outward navigation.

For future updates, implement and verify changes in Carrot Revolt first, then mirror the affected labs, shared dependencies, catalog entries and tests to CIFOG while retaining CIFOG's storage namespace. Deleting CIFOG and redirecting its old URLs are separate future tasks.
