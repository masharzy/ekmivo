# Phase 10 sender guard follow-up — verification pending

The superseded 5a531e5d workflow's available logs exposed two regressions before its replacement run: the read-only browser assertion still expected “Inbox” after the scope-specific UI changed it to “conversation”; and an invalid AI queued message was correctly failed, but the new generic channel guard assigned CHANNEL_ACCESS_REVOKED before the established AI guard could record AI_CONTEXT_CHANGED.

The browser keeps its exact visible read-only assertion with the updated text. Additive CONTROL 0210 restricts the generic queued revocation update to human/requester messages. Existing AI validity/context failure, human takeover, source-window, ordered-batch and broadcast consent/offer checks remain. The stronger pre-transport AI/context check in 0209 is preserved. No existing migration is rewritten and no security assertion is relaxed.

The independent parity gate remains blocked on exactly three rows: broadcasts, member channel scopes and payment links. A verified courier row now points to the separate owner physical/provider checklist, so its code evidence does not accidentally match the gate's broad “pending” string search. No provider/device acceptance is claimed, and the gate script itself is unchanged. New source requires integrated CI; no merge, deployment or production operation is authorized.
