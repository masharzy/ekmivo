# Admin connection setup UI — 2026-10-25

The Settings connection form previously displayed every raw environment key in
one long list. AI and messaging now have separate sections within the existing
admin design, with human-readable labels and a shared audited save action.

- OpenRouter and direct Qwen are explicit provider choices. OpenRouter offers
  `qwen/qwen3.8-omni-flash`; direct Qwen retains its existing 3.5 model family.
- API key and model inputs are grouped with provider links and a model-rate
  shortcut. Saved keys stay blank and cannot be revealed from the response.
- Meta app inputs are grouped; webhook/redirect inputs are expandable.
  Telegram keeps its existing per-business connection flow.
- Drafts survive section changes and failed saves, remain in memory only, and
  participate in the existing navigation guard. Refresh cannot overwrite drafts.
- API calls, encryption, platform permissions and revisions remain unchanged.
  Pending storage setup and provider testing are labelled honestly.

## Browser verification

Used the production component bundled into an isolated local UI preview with a
simulated API. These are UI checks, not evidence of live provider execution.

- Preview loaded with no key configured; Save disabled before required input.
- Entered a synthetic OpenRouter key and model, switched to messaging and back;
  the draft persisted. Successful simulated Save cleared the key, reset the
  reason, displayed Saved metadata and left the model visible.
- Advanced the simulated revision separately. A stale Save returned conflict;
  the model/reason drafts and retry controls remained present.
- Widths 320/768/1024/1440 had no horizontal page overflow.
- Inspected full-page 320px Bengali dark mode and desktop English light mode.
- No real key, provider call, AI request or pricing change was made by these tests.

## Operational context

Before this UI change, the Go service was serving an older backend because
new deployments failed the authorization database startup probe. Correcting
`AUTHZ_DATABASE_URL` to the verified existing restricted production runtime
connection allowed deployment `dep-dbefqd8ae00c73d0vflg` (main f6b8505) to go live.
The channel-config endpoint changed from 404 to authenticated routing; the
signed-in admin form loaded. Existing storage setup was still unavailable and
this visual change does not apply unrelated schema migrations or claim key-save
or live AI readiness.
