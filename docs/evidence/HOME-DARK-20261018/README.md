# Home dark-mode implementation checkpoint

Status: implementation prepared; visual acceptance OPEN. Do not publish this as completed.

Owner clarification: only Dark changes. Light text sizes and colors stay unchanged,
superseding the original brief's request to enlarge text in both themes.
Baseline: `7f3643b29a9a610ff125e6b10758651d731c99d8`.
Both supplied PDFs were rendered and all eight pages visually inspected.

## Implementation checklist

- [x] Preserve current yellow (`#FFD65F`) on primary actions and step circles; use it on dark avatar chips.
- [x] Restore rough pink highlighter with a 30% muted rose fill; retain original polygons and rotation.
- [x] Restore section rhythm with deep blue and deep amber tints.
- [x] Give Payments and AI cards separate blue/amber surfaces.
- [x] Use raised surfaces, subtle borders and shadows; preserve existing tilted geometry.
- [x] Use warm cream with navy text for the active tab and illustrative checkout action.
- [x] Dark-only type minimums: labels/notes 12px, descriptions 14px, footer 13px.
- [x] Move literal colors/shadows out of home editorial CSS into reusable opt-in role tokens.
- [x] Keep home chrome overrides scoped to `body:has(main.em)`; product-wide token values are untouched.
- [x] Source comparison: every existing Light CSS declaration, responsive rule and keyframe resolves identically to baseline after expanding aliases.
- [ ] Before/after Light screenshot comparison (source equivalence is not screenshot proof).
- [ ] Rendered contrast audit including all actual text states, backgrounds, pseudo-elements and opacity.
- [ ] English/Bangla browser matrix at 320/390px, 768px and 1440px, including overflow checks.
- [ ] Browser interaction checks: language persistence, Light/Dark/System (both OS modes), menu, FAQ, workflow buttons and links.

No layout, copy, routes, API, auth or component logic was edited. Home pricing is
covered by locally scoped aliases; standalone pricing stays unchanged.

## Shared roles

`apps/web/src/styles/brand/brand-tokens.css` is the single value source.
Future consumers can import it and opt in using `.ek-brand`. Nothing opts the
dashboard or Developers portal in. Explicit Light overrides OS Dark; absent theme
attribute follows the OS.

| Token | Light (preserved) | Dark |
|---|---|---|
| `--brand-bg` | `#fcfbf6` | `#121110` |
| `--brand-surface` | `#fffefa` | `#171614` |
| `--brand-surface-raised` | `#fffefa` | `#1c1b18` |
| `--brand-text` | `#17233b` | `#f5f1e8` |
| `--brand-text-muted` | `#59657b` | `#b9b6ad` |
| `--brand-border` | `#d3dce1` | `rgb(255 255 255 / 14%)` |
| `--brand-accent` | `#ffd65f` | `#ffd65f` |
| `--brand-accent-contrast` | `#19243a` | `#19243a` |
| `--brand-highlight` | `#f5c8bf` | `rgb(211 133 145 / 30%)` |
| `--brand-tint-blue` | `#e1f1fa` | `#0f1a24` |
| `--brand-tint-yellow` | `#fff0ad` | `#241d0c` |
| `--brand-tint-cream` | `#f5f1e7` | `#23211c` |
| `--brand-tint-edge` | `#aacfe2` | `#334958` |
| `--brand-action` | `#17233b` | `#f5f1e8` |
| `--brand-action-contrast` | `#fffefa` | `#17233b` |
| `--brand-stroke` | `#17233b` | `#f5f1e8` |
| `--brand-mask` | `#000` | `#000` |
| `--brand-shadow` | `0 24px 54px rgb(35 49 69 / 9%)` | `0 22px 52px rgb(0 0 0 / 35%)` |
| `--brand-shadow-hover` | `0 10px 0 rgb(28 45 70 / 10%)` | `0 10px 0 rgb(0 0 0 / 24%)` |
| `--brand-shadow-card-hover` | `0 26px 60px rgb(0 0 0 / 13%)` | `0 26px 60px rgb(0 0 0 / 45%)` |
| `--brand-shadow-pill` | `0 3px 9px #0001` | `0 3px 9px rgb(0 0 0 / 24%)` |
| `--brand-shadow-deck` | `0 22px 36px rgb(35 49 69 / 7%)` | `0 22px 36px rgb(0 0 0 / 25%)` |

## Calculated contrast

WCAG relative-luminance calculation using sRGB linearization. These are exact
palette-pair calculations, not a completed rendered DOM audit. All listed pairs
exceed the normal-text AA minimum of 4.5:1. Highlight rows alpha-composite the
30% rose over the named surface before measuring the warm text.

| Foreground | Background | Ratio |
|---|---|---|
| text | page | 16.73:1 |
| muted | page | 9.30:1 |
| text | page + 30% highlight | 10.08:1 |
| text | surface | 16.04:1 |
| muted | surface | 8.92:1 |
| text | surface + 30% highlight | 9.56:1 |
| text | raised | 15.28:1 |
| muted | raised | 8.49:1 |
| text | raised + 30% highlight | 9.07:1 |
| text | blue | 15.61:1 |
| muted | blue | 8.68:1 |
| text | blue + 30% highlight | 9.40:1 |
| text | amber | 14.83:1 |
| muted | amber | 8.25:1 |
| text | amber + 30% highlight | 8.79:1 |
| text | cream | 14.27:1 |
| muted | cream | 7.93:1 |
| text | cream + 30% highlight | 8.48:1 |
| 19243a | accent | 11.10:1 |
| 17233b | cream action | 13.90:1 |

## Deliberately separate product palettes (unchanged)

These differ from the new marketing roles; they are independent product systems,
not grounds to recolor them in this task.

| Surface / source | Existing dark roles | Marketing equivalent |
|---|---|---|
| Dashboard (`components/dashboard-reference.css`) | bg `#0A0B0E`, panel `#131418`, text `#ECECF0`, muted `#8B8D97`, accent `#8B87FF` | bg `#121110`, raised `#1C1B18`, text `#F5F1E8`, muted `#B9B6AD`, accent `#FFD65F` |
| Developers (`app/(developer-portal)/[locale]/developers/portal.css`) | bg `#0A0B0E`, panel `#131418`, text `#ECECF0`, muted `#9698A3`, accent `#A29EFF` | same marketing roles above |
| Shared older public palette (`app/public-experience.css`) | yellow `#FFF`, blue `#121212`, peach `#4A4A4A` | yellow `#FFD65F`, blue `#0F1A24`, highlight `rgb(211 133 145 / 30%)`; overrides only on home chrome |

## Verification and blockers

- CSS AST source-equivalence comparison against baseline: PASS. Every non-variable
  declaration in the Light editorial stylesheet matches, including responsive
  and animation rules; all new presentation selectors are Dark guarded.
- Palette contrast calculations: PASS for the 20 pairs above.
- TypeScript `npx tsc --noEmit`: PASS.
- ESLint `npm run lint`: exit 0; 50 existing warnings in unrelated files, zero errors.
- Existing `node --test tools/testing/public-pay-design.test.mjs`: 5/5 PASS.
  These protect existing standalone checkout structure; they do not verify home visuals.
- Production build: PASS on the final source (including the Next TypeScript check), rerun after resuming on 2026-10-18.
- Browser plugin initialization timed out. Cloud-browser preview navigation also
  timed out; the resumed attempt returned `net::ERR_CONNECTION_REFUSED` for the local preview. No successful rendered-page inspection was obtained; responsive,
  functional and screenshot acceptance remain OPEN.
- Main push is withheld because the owner's full verification gate is not met.

Remote implementation branch: `codex/home-dark-tokens`; source commit `74f7062bcff81f8f8126a6434780640d07e36b4e`. Main has not been updated.
