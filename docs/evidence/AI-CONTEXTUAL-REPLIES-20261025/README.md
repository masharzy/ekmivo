# Contextual clarification instead of automatic handoff

Production inspection of the `???` channel job confirmed its context included
the previous eight text messages, including the preceding service explanation.
The problem was the system prompt's unconditional instruction to say a human
needs to help whenever quoted facts do not directly answer a question.

Replace that rule with a conversational clarification policy: interpret short
follow-ups against recent history, rephrase a relevant previous answer, or ask
one specific question. Current business facts override stale earlier AI claims.
Greetings and clarification need no matching business fact. Missing business
facts still cannot be invented; real manual actions remain human handoffs.

Keep existing tenant-scoped history selection, eight-message/700-character
bounds, injection boundaries and metering. This is recent context, not unlimited
conversation memory. Unit regression checks preserve ordered history alongside
the punctuation-only question and prohibit the old blanket handoff rule.

Live model behavior verification is pending at commit.
