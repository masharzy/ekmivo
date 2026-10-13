# Standalone customer /pay & /checkout — branded payment handoff (2026-10-13)

Owner's screenshots: merchant logo and contacts; blue Mobile Banking selection with actual enabled bKash/Nagad/Rocket accounts; bKash pink or Nagad red payer-number and transfer confirmation/waiting layouts; no marketing dashboard header/footer; no receipt-email opt-in UI; same provider palette for light and dark.

- Merchant name/logo and support links come from the existing signed public business brand, never placeholder data. Contact links render only when configured.
- Live document GET reads provider method IDs via scoped, readonly 0050 function (financial owner + restricted reader EXECUTE); no account numbers, SMS contents or device credentials leave the financial realm. Go additionally applies production-approved parser rules to mark each configured card selectable or unavailable. Sandbox is labelled clearly and cannot instruct payment of real funds.
- POST idempotency and link issuance remain server-authoritative; method is only a URL UI preference to the new checkout, while Go validates the chosen actual payer and method at lock.
- Checkout awaiting state uses server-derived receiving number + copy, transfer steps, polling and server-expiry. bKash/Nagad/Rocket styled individually; Bangla QR postponed. Native-app tutorial panel is an illustration, not an official provider app screenshot.
- Receipt email/consent components do not render in public checkout. Backend existing notice endpoints and previous consent records remain intact.
- Manual pending: real browser mobile/desktop/locale/light/dark, actual merchant logo/contact configuration, provider native experience screenshot parity, real SMS parser/device/provider and payment test. No automatic settlement is claimed from design.
