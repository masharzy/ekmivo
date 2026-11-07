# ZiniPay merchant-dashboard reference

Observed 2026-10-11 in the user's signed-in Chrome tab at https://dash.zinipay.com/d. Read-only navigation; invoice/payment-link forms opened for inspection but nothing submitted. Receiving account numbers, IP addresses and secrets are intentionally excluded. No claim that ZiniPay is derived from PipraPay: UI similarity is insufficient evidence.

## Information architecture

| Group | Observed pages |
|---|---|
| Overview | Dashboard, Analytics |
| Payments | Pending Requests, Invoices, Customers, My Payments, Stored Data |
| Gateway | View Gateways, Payment Links, Notifications |
| Landing Page | Create/Edit Page, Order Management |
| My Plan | Upgrade Plan, Credits & Balance, Wallet/Add Funds, My Service |
| Settings | Team Management, Brands, Devices, Apps & Plugins |
| Automation | Reference Rules, Payment Events, Webhook Settings, Notifications, Delivery Logs |
| Growth | Refer & Earn, Developer Docs, Terms Policy |

The sidebar uses group headings and icons. The overview separates collected volume, pending recovery, stored receipts, charts and transactions. Brands, devices and receiving methods each have dedicated operational views.

## Inspected page details

- Dashboard: balance, today's collected amount, 30-day completed volume, pending recovery, unused receipt count, monthly table, daily/status chart, transaction table, login history.
- Pending Requests: manual approval/deletion queue, provider filters, invoice/customer/TrxID/amount/time. This normal manual flow is not Briofold's required auto-verification flow.
- Invoices: filters by identifiers/customer/method/status/payment link; sender/brand/method/amount/date/actions. Create form: brand, amount, customer, return/cancel URLs and IPN URL; verified-domain rules.
- Payment Links: product/brand/price/actions; create form product name, image URL/upload, any-amount option, redirect, brand, note, customizable customer fields.
- Receiving methods: provider, account/type, brand, credentials, min/max, fees, status, ordering.
- Devices: last update, brand, masked credential, add/reset/delete, Android app links and iPhone helper. No secret revealed or device action submitted.
- Reference Rules: exact/prefix/regex patterns. Payment Events: provider/receipt ID/amount/reference/automation status.
- Webhooks: endpoint and signing secret per brand, domain requirement. Delivery logs: time/event/status/HTTP/retries/response.
- Customers: source and location/date filters, column settings, sortable contact/source/created fields, pagination.
- Stored Data: receipt ID/phone search, provider/brand/sender/amount/date, manual add entry. Manual evidence insertion was not performed.
- Analytics: date/status filters, column selection and export.
- Notifications: email SMTP and templates, Telegram bot/chat target and templates, delivery log. Credentials/test sends unchanged.
- Brands: masked keys and brand status. Team: totals/active/invited, seat limit, search/add affordance.
- Credits: plan eligibility and verification API guide. Apps & Plugins: WordPress/WHMCS/Perfex/Laravel/PHP/SMM/JavaScript downloads; none installed.

Other sidebar destinations were inventoried, not all opened or exercised. Empty lists and disabled fields are visibility limits, not evidence their live actions work.

## Briofold application

Keep product switching separate from business switching. Payment overview concerns payment/receipt/device operations; AI overview concerns conversations, handover, leads and usage. Every route needs a proper domain view and acceptance evidence. Distinct tabs and columns only complete UI scaffolding, not the data service, mutations or provider integration.
