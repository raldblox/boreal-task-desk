# boreal.work brand kit

The rules are in the brand book, [`brand.md`](../../brand.md) at the repo root. This folder holds the files it points to.

- `logo/boreal-mark-light.svg`: the mark for light grounds (ink #00696a).
- `logo/boreal-mark-dark.svg`: the mark for dark grounds (ink #5ac6bd).
- `logo/boreal-mark-ink.svg`: one-colour mark (ink #1b2a30).
- `logo/boreal-app-icon.svg`: white mark on the teal app tile.
- `tokens.json`: colour (light and dark), type, spacing, radius and logo tokens, mirroring `apps/web/src/app/globals.css`.
- `x-avatar.png`, `x-banner.png`: the X profile images, rendered from `apps/film/src/XProfile.tsx`.

The logo geometry's source of truth is `MARK_PATHS` in `apps/web/src/components/brand.tsx`. If it changes, regenerate these SVGs, the app icons and the X stills from it.
