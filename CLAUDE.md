# Ekmivo Android: working rules

Project: Kotlin + Jetpack Compose seller app for Ekmivo (SMS payment forwarder, later a chat inbox). Rebuild in progress.

Repo layout (fill in the real folder names):
- Android app: apps/mobile   <- all work happens here
- Web dashboard: apps/web     <- read ONLY the design-token files and the pairing page/API, nothing else
- API/backend: backend       <- read ONLY the pairing and SMS-ingest endpoints, nothing else

## Token discipline (read this first)
1. Never read the whole repo. Use search (grep, file search) to find what you need, then open only those files.
2. Work inside apps/mobile. Open apps/web and backend only in Phase 0, and only for: design tokens (Tailwind config / globals.css / theme), the page and endpoint that create the pairing QR/code, the pairing-validation endpoint, the SMS-ingest endpoint.
3. Write what you learn from web/API into PROGRESS.md (token values, pairing flow, endpoints, payload formats). Later phases read PROGRESS.md and must NOT reopen the web or API folders.
4. Do not re-read files you already read in this session. Do not paste large files into your replies.

## Source of truth for design (read before any UI work)
- docs/design/ekmivo-android-final-prompt.md  (behaviour, flow, copy rules)
- docs/design/ekmivo-android-design-spec.md   (exact sizes, colours, copy, composables)
- docs/design/ekmivo-app-design.html + docs/design/screenshots/  (visual reference)

## Non-negotiable rules
1. The reference design is law. Do not redesign, simplify, reorder, rename, re-colour, or add elements.
2. Do not use stock Material 3 components (NavigationBar, Card, Button, chips, ListItem, Switch). Use the custom composables from the spec.
3. No elevation, shadows, gradients, or default tonal colours.
4. Copy rules in section 0a of the final prompt override any text in the spec or HTML: no payment-provider names, no inaccurate claims, no demo data.
5. Colours, fonts and radii come from the web dashboard tokens; layout comes from the reference.
6. Investigate root causes before fixing. No stacked patches.
7. Do ONLY the phase I ask for. Do not start the next phase. Do not touch UI during non-UI phases.

## Completion rule (no self-declared "done")
- Never report a screen or phase as complete without evidence: an emulator screenshot at 360dp and 412dp next to the reference screenshot, and the filled match table from spec section 7.
- If anything does not match or is unfinished, say so plainly in the first line of your report, listing exactly what is missing. Partial work must be labelled as partial.
- If I say something is missing, check it against the spec before replying. Do not just agree: either fix it or show that it matches.

## End of every phase
Run the build and tests, commit, and update PROGRESS.md (done, decisions, open questions, needs-web-change list).

## Questions
Ask only when blocked by something not findable in the code. Otherwise state the assumption in one line and continue.