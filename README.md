# Lumen DS

## Design tokens

`resources/tokens.json` is the Figma variables export and the source of the
published `/tokens.json` catalog. `scripts/token-overrides.json` contains
temporary values for missing export references.

Run `npm run sync:tokens` (or `npm run tokens`) after updating the export. It
generates `src/tokens.lumen.css` from the same catalog used by `/tokens.json`,
including dark-theme overrides and Tailwind aliases, following the Modern
project's sync convention. Do not edit the generated stylesheet. Dark-only
tokens use `initial` in the light theme.

`npm run build` synchronizes tokens before compiling CSS and publishing the
static catalog. Development uses the generated snapshot; rerun the sync command
after changing the export.
