# Ekmivo Android rebuild: handoff pack

Why this exists: one giant prompt makes agents drift and burns tokens on re-reading. Instead, the rules live in a file inside the repo (so every new session or account starts with them), and the work is split into phases. Each phase is a short prompt.

## Setup (once)

1. Put these files in the Android repo under `docs/design/`:
   - `ekmivo-android-final-prompt.md`
   - `ekmivo-android-design-spec.md`
   - `ekmivo-app-design.html` (open it in a browser to see the screens)
   - `screenshots/` : one screenshot per screen from the reference page (first-time setup steps 1 to 10, then Home, Code, Disconnected, Settings)
2. Make the web dashboard repo available to the agent (read-only is enough): it is needed for design tokens and the real pairing flow.
3. Create `CLAUDE.md` in the Android repo root with the text in section A below.
4. Create an empty `PROGRESS.md` in the repo root.
5. Use an agent that works **inside the repo** (Claude Code). Pasting files into a chat wastes tokens and loses context.

---

## A. CLAUDE.md (paste into the repo root)

```
# Ekmivo Android: working rules

Project: Kotlin + Jetpack Compose seller app for Ekmivo (SMS payment forwarder, later a chat inbox). Rebuild in progress.

Source of truth (read before any UI work):
- docs/design/ekmivo-android-final-prompt.md  (behaviour, flow, copy rules)
- docs/design/ekmivo-android-design-spec.md   (exact sizes, colours, copy, composables)
- docs/design/ekmivo-app-design.html + docs/design/screenshots/  (the visual reference)

Non-negotiable rules:
1. The reference design is law. Do not redesign, simplify, reorder, rename, re-colour, or add elements.
2. Do not use stock Material 3 components (NavigationBar, Card, Button, chips, ListItem, Switch). Use the custom composables from the spec.
3. No elevation, shadows, gradients, or default tonal colours.
4. Copy rules in section 0a of the final prompt override any text in the spec or HTML: no payment-provider names, no inaccurate claims, no demo data.
5. Colours, fonts and radii come from the web dashboard repo tokens; layout comes from the reference.
6. Investigate root causes before fixing. No stacked patches.
7. Do ONLY the phase I ask for. Do not start the next phase. Do not touch UI during non-UI phases.
8. After every UI screen: take an emulator screenshot at 360dp and 412dp, compare with the reference screenshot, and fill the match table from spec section 7. Fix mismatches before moving on.
9. At the end of every phase: run the build and tests, commit, and update PROGRESS.md (done, decisions, open questions, needs-web-change list).
10. Ask questions only when blocked by something not findable in the code or web repo; otherwise state the assumption in one line and continue.
```

---

## B. Phase prompts (send one per session, in order)

Start every session with: `Read CLAUDE.md and PROGRESS.md first.` Then send the phase prompt.

### Phase 0: audit and theme (no screens)
```
Phase 0 only. Do not read the whole repo: follow the token discipline in CLAUDE.md and use search to find files. 1) Audit the Android project: root causes for the problems in section 2 of the final prompt, architecture assessment, how the app is distributed (sideload or Play), what backend or web changes are needed. 2) Read the web dashboard repo and port its design tokens into a Compose theme (EkmivoTokens.kt + typography + shapes, light and dark), using the structure in spec section 2. 3) Find the real pairing flow in the web repo (section 3.3c): where the QR/code is generated, labels, login requirement, code format, QR payload, deep link. Write findings into PROGRESS.md. Build a single preview screen showing palette, type scale and the custom composables from spec section 5. No other screens.
```

### Phase 1: state machine and data layer (no UI)
```
Phase 1 only, no UI changes. Implement ConnectionState (section 3.1), the repository, the auth interceptor that maps 401/403 to Revoked in one place, Room persistence of received SMS before upload, idempotent WorkManager upload with backoff, server-config sender filter, and unit tests (state machine, SMS filter, 401 clears credentials). Keep existing delivery logic working behind the new repository.
```

### Phase 2: pairing screens
```
Phase 2 only. Build, exactly per spec 3.3, 3.3a, 3.3b: Welcome, Camera permission, Scan, Confirm sheet, Connecting, and Code entry, wired to the real pairing flow and the state machine. Welcome step text comes from the real flow (3.3c). No shop name on any screen before the QR/code is validated. Scan success goes straight to Confirm. Verify each screen with the screenshot loop. Stop after these screens.
```

### Phase 3: permission wizard and Setup Health
```
Phase 3 only. Build Setup Health (section 3.2) and the permission wizard (spec 3.4 and step list in 3.3a) plus the Done screen. Auto-advance on grant, skip already-granted steps, handle denied and don't-ask-again, Samsung step only on Samsung. Verify with the screenshot loop. Stop after these screens.
```

### Phase 4: Home and Disconnected
```
Phase 4 only. Build Home (spec 3.2: header chip, pulse-ring hero, stat tiles, payment feed with detail sheet, health card when needed), the custom bottom nav (3.6), and the Disconnected screen (3.5), all driven by ConnectionState and real data. Hero label follows rule in 0a (verified vs forwarded). Verify with the screenshot loop. Stop after these screens.
```

### Phase 5: Settings and diagnostics
```
Phase 5 only. Build Settings exactly per spec 3.7 with real state (Setup Health values, language, theme), the disconnect confirmation sheet, and the Diagnostics screen (export logs, test forward, rescan inbox, version). Verify with the screenshot loop. Stop after these screens.
```

### Phase 6: Inbox groundwork and final QA
```
Phase 6 only. Inbox groundwork behind the inboxEnabled flag (no visible tab): package, route, notification channel, FCM token plumbing, domain model, repository interface. Then final QA: side-by-side screenshots of every screen at 360dp and 412dp dark and light, Bangla and English, list any deviation, run all tests, and write the manual QA steps (including a real Samsung device with the screen off for 30 minutes).
```

---

## C. If you switch accounts or models mid-way

The new session knows nothing about the old one. It does not need to: `CLAUDE.md` holds the rules and `PROGRESS.md` holds the state. Start with `Read CLAUDE.md and PROGRESS.md first, then continue with Phase N.`

## D. Keeping token use down

- Commit after each phase and start a fresh session for the next one.
- Attach only the screenshots for the screens in the current phase.
- Do not paste code into chat; let the agent read the repo.
- If the agent drifts, do not argue in the same long session: point it at the spec section it broke, ask for the match table, and if it keeps failing, start a new session for that screen only.