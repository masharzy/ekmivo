# Paymently browser audit — বাংলা

Audit date: 2026-10-11, Asia/Dhaka। Signed-in merchant dashboard: https://easy-education.paymently.io/admin/default। Account plan: Free; দেখা quota 20 payments। Account-এর records খালি।

**Coverage:** ১৩টি internal main-menu destination, Profile, enabled settings subpages, reports, creation forms এবং প্রয়োজনীয় dropdown/dialog পরীক্ষা করা হয়েছে। ৭৫টি snapshot, query states-সহ ৪৩টি observed URL; query বাদ দিলে ৩৯টি path — ৩৭টি merchant path ও ২টি linked documentation page। Counts নিজে functional completeness বোঝায় না। [Route coverage](paymently-browser-coverage.csv), [redacted evidence](evidence/paymently/ui-snapshots.json)।

এটি browser/UI audit; source-code/security penetration test নয়। কোনো customer, gateway, invoice, API key, receipt বা integration save/create করা হয়নি; fund/payment/refund/verification submit করা হয়নি; file upload, plugin installation বা message send করা হয়নি। Light theme সাময়িক পরীক্ষা করে আগের System preference ফেরানো হয়েছে। Forms থেকে unsaved selections navigation-এর মাধ্যমে বন্ধ করা হয়েছে; শেষে original dashboard-এ ফেরানো হয়েছে।

## প্রধান সিদ্ধান্ত

Paymently payment service-এর operational dashboard reference হিসেবে ভালো: icon navigation, compact header, status tabs, table-specific columns, field-level helper text, staged configuration ও পৃথক SMS/device management আছে। আমাদের payment dashboard-এ এই information structure কাজে লাগবে; AI inbox/agent/leads আলাদা product context-এ থাকবে। Paymently-এর blue accent বা সব competitor feature আমাদের নির্ধারিত monochrome design/scope-এর বিকল্প নয়।

Browser থেকে **sender + transaction time + amount + receiving account/method মিলিয়ে zero-TrxID customer verification প্রমাণ হয়নি**। SMS automation ও balance/smart verification controls দেখা গেছে; algorithm বা real customer checkout পরীক্ষা হয়নি। Merchant `verify-payment` status API আর underlying receipt matcher আলাদা দায়িত্ব।

## Navigation ও global shell

| অংশ | যা দেখা/পরীক্ষা হয়েছে |
|---|---|
| Core | Dashboard, Payments, Gateways, Customers, Invoices, Payment Links, Reports, Brand Settings |
| Developers | API Keys, Integrations, external API References; group collapsible |
| Sidebar নিচের অংশ | SMS Data, System Settings, My Billing — quota badge |
| Header | Sidebar collapse, logo/home, global search with CTRL+K hint, calculator, notifications, user menu |
| User menu | Profile; Light/Dark/System; Sign out |
| Accessibility structure | Skip-to-content link, labelled navigation, headings, tablist/tab, dialogs, labelled buttons and inputs present |

Desktop screenshot-এ sidebar আলাদাভাবে scroll করে। Current menu background ও accent দিয়ে চিহ্নিত; icon + label পাশাপাশি। Header-এ ছোট utility controls; main content-এ consistent heading/breadcrumb/action। Actual narrow-screen, screen-reader, keyboard trap এবং WCAG contrast audit করা হয়নি।

Calculator-এ `2 + 2 = 4` পরীক্ষা পাস। Notifications click-এ “No notifications” dialog খুলেছে। Global search-এ সাধারণ `invoice` query পরীক্ষা করে clear করা হয়েছে; খালি account-এ useful record results বা routing accuracy প্রমাণ হয়নি। Admin shell English; user-menu-তে admin EN/BN switcher দেখা যায়নি। Brand settings-এ checkout language English/Bangla choices আছে — এটি admin locale switch-এর সমতুল্য নয়।

## Page-by-page inventory

### Dashboard

- Default-credentials warning, profile-update link; identity-verification warning ও Start Verification link। Default email warning দেখা গেছে; password পরীক্ষা/পড়া হয়নি।
- Total Payments, Pending Payments, Unpaid Invoices, Pending SMS Data — চার metric card; প্রত্যেকটির সংশ্লিষ্ট list link।
- Payment Statistics এবং Payment Statistics by Gateway chart। Period choices: Today, Yesterday, This week, Last week, This month, Last month, This year, Previous year, Custom Range।
- খালি account-এ সব card count 0; visually sparkline আছে। এই graphics থেকে actual historical transactions ধরে নেওয়া হয়নি।

### Payments

- Tabs: All, Completed, Pending, Refunded, Partially refunded, Failed, Voided, Initiated, Trashed। Pending/Trashed selected state ও query navigation পরীক্ষা হয়েছে।
- Default columns: Customer, Gateway, Amount, Net Amount, Transaction Id, Date, Status। Column manager-এ অতিরিক্ত Id, Refunded Amount, Phone Number আছে; visibility পরিবর্তন করা হয়নি।
- Search; filters: Status, Gateway, Customer Email prefix, Created From/Until; Reset।
- No payments। তাই payment detail, refund, reversal, restore বা provider status operations দৃশ্যমান real record-এ পরীক্ষা হয়নি।

### Gateways

- Automatic list; New gateway chooser, record reordering, Search, Column manager। Columns: Display name, Label, Currency, Status।
- Chooser-এ search এবং currency grouping: BDT; conversion from EGP/USD। Bank/MFS/API/aggregator/crypto options পৃথক card। bKash Personal tile select করা হয়েছে; **Create চাপা হয়নি**, তাই account configuration screen বা connected method তৈরি হয়নি।
- Listed MFS families: bKash, Nagad, Rocket, Upay, Tap, OK Wallet, CellFin, iPay, mCash, Pathao Pay। Personal/Merchant/Agent এবং provider-specific API/PayStation/SSLCommerz variants আছে; সব family-তে সব variant আছে বলে দাবি নয়।
- Bank options: AB, Al-Arafah Islami, Bank Asia, BRAC, Islami, City, Dhaka, Eastern, IFIC, Janata, Midland, Mutual Trust, Prime, Pubali, UCB; Bangla QR, DgePay Merchant, PayStation ও SSLCommerz-ও আছে।
- EGP/USD section: Vodafone Personal, Binance Personal, Bybit Personal, Cryptomus Merchant, Paddle, PayPal, PayPal Personal, Stripe। Exact chooser inventory snapshots-এ রয়েছে; listing ≠ operational provider integration।

### Customers

- Tabs All/Manual/Checkout। Columns First name, Last name, Company, Email, Phone, Status, Portal।
- Search, Column manager; filters City, State, Country, Created From/Until।
- Actions menu: Export customers, Import customers। Import dialog: example CSV download, CSV upload, Import/Cancel। Upload/import/export execute হয়নি; mapping/validation behaviour অজানা।
- Create form: required First name/Email/Phone; Last name, Company, Address, City, State, Postcode, Country; Create/Create & create another/Cancel।

### Invoices

- Tabs All/Paid/Unpaid/Partial/Refunded/Canceled/Trashed। Columns Customer Name, Customer Email, Currency, Amount, Status।
- Filters Status/Currency/Customer Email/Created From/Until; Search/Column manager।
- Create: customer selection + inline customer-create control; currency; Due Date; status dropdown; repeatable Items with description, quantity, amount, discount, VAT and reorder/collapse/delete; Add to Invoice Items।
- Redirect URL, rich-text private notes, public notes। Totals section: Shipping, VAT, Discount, Total Amount; derived fields disabled। Create/Create another/Back।
- Status dropdown-এ Paid বেছে নেওয়া সম্ভব দেখা গেছে; save বা backend accounting effect পরীক্ষা হয়নি। আমাদের ক্ষেত্রে invoice label থেকে verified payment truth তৈরি করা যাবে না।

### Payment Links

- Search/Column manager। Product name, Product description, Amount, Quantity, Status। Generate Default Link action দেখা গেছে; generation execute হয়নি।
- Create form তিন section: Product Information / Product Image / User input fields। Name, quantity, description, currency, amount, expiry, active status, redirect; image upload supports JPG/JPEG/PNG/WEBP।
- Custom field add preview করা হয়েছে। Types: Text, Textarea, Select, Radio, Checkbox, File; field reorder/delete আছে। প্রতিটি field type-এর nested validation বা real customer submission পরীক্ষা হয়নি।

### Reports

পাঁচটি report destination খুলেছি। Financial records খালি; data calculations correctness যাচাই নয়।

| Report | দেখা metrics/content |
|---|---|
| Overview | Today/Yesterday, This/Last Week, This/Last Month, This/Last Year, Lifetime revenue snapshot এবং successful counts/comparison |
| Revenue | Period/custom range; Gross Revenue, Net Revenue, Refunded, Avg Order Value; gross/net chart |
| Payment Methods | Active Methods, Top Method, Best Success Rate, Total Revenue; Gateway/Transactions/Success/Revenue/Avg Order/Refunds table |
| Refunds | Refund count, Refunded Amount, Refund Rate, Average Refund; amount chart |
| Customers | New/Returning Customers, Repeat Rate, Avg Customer Value; new-customer chart |

### Brand Settings — সব ৯টি card destination

| Page | Options/fields |
|---|---|
| General → General | Site Name, timezone, currency/symbol, Payment Window minutes (gateway override noted), checkout language English/Bangla, week-start day, GTM ID |
| General → Business Details | Street Address, City/Town, Postal/ZIP Code, Country |
| General → Contact & Social | Support phone/email/site, Facebook, Messenger, WhatsApp, Telegram, YouTube |
| Logo & Favicon | Primary Logo, Round Logo, Favicon; upload dimensions/format hints |
| Themes | Default Theme, Nova; Activate controls; Search/pagination. Activation হয়নি |
| FAQ | Title/Status table, reorder/search; create Title/Content/Status form |
| SEO | Meta description, keywords, Facebook/LinkedIn and Twitter/X sharing images |
| Meta Pixel | Enable; purchase trigger Completed/Pending/Both; Pixel ID, CAPI token, test code; credential setup guide |
| Orderbox | Empty Label/Key list; create gateway label/key, generated checkout URL and provider checksum setup guide |
| Liquid | Empty API key/Reseller ID list; create label/key/Reseller ID, helper server IP/checkout URL and provider setup guide |
| Shopify | Empty Label/Shop domain list; create label/domain/Client ID/Client Secret, generated URL; custom-app/deploy/checkout-block guide |

General sub-tabs account for তিন views within one General destination; মোট nine settings cards, eleven settings views। কোনো setting saved, password revealed, external app created বা provider deployment শুরু করা হয়নি। Generated integration capability URLs ও IP evidence-এ redacted।

### API Keys ও API References

- Name/Abilities/Expires at/Active table। New-key dialog: name, abilities `payment:checkout`, `payment:verify`, `payment:refund`, expiry, active switch। Key create/reveal হয়নি।
- Endpoint dialog: `/api`, `/api/checkout`, `/api/checkout-v2`, `/api/verify-payment`, `/api/refund-payment`। Documentation এবং copy affordances আছে; copy বা API request execute হয়নি।
- Linked UddoktaPay docs-এ [Verify Payment](https://uddoktapay.readme.io/reference/verify-payment-api-guideline) merchant-এর `invoice_id` দিয়ে current status retrieval বর্ণনা করে; response-এ sender/transaction/date fields রয়েছে। এটি underlying SMS matching algorithm-এর evidence নয়।
- Linked [Validate Webhook](https://uddoktapay.readme.io/reference/validate-webhook) example API-key header comparison ও JSON parsing দেখায়; ওই example-এ signed-body/timestamp/replay mechanism নেই। Documentation পুরোনো; বর্তমান Paymently delivery protocol পরীক্ষা হয়নি।
- Paymently UI-তে UddoktaPay documentation/plugins linkage সরাসরি আছে। এখান থেকে PipraPay-derived source বা code provenance প্রমাণ হয় না।

### Integrations

UI-তে 17 card: WooCommerce, Shopify, WHMCS, WiseCP, Tutor LMS, Paid Memberships Pro, Perfex CRM, Clientexec, Easy Digital Downloads, Blesta, Magento, PrestaShop, OpenCart, Drupal Commerce, Joomla, Paymenter, FossBilling। Search ও category filter: E-Commerce/Billing & Hosting/LMS & CMS/CRM/Forms।

Magento, PrestaShop, Drupal Commerce ও Joomla “Coming soon”। Shopify Download link-এর URL ফাঁকা দেখা গেছে; Shopify brand-settings flow আলাদা আছে। বাকিগুলোর visible links plugin/GitHub destinations; কোনো download/install/test হয়নি। “17 integrations” শিরোনামকে 17টি verified working connector বলে গ্রহণ করা যাবে না।

### SMS Data / Devices / Balance Verification

- SMS tabs: All, Approved, Awaiting review, Used, Trashed। Columns Device, Payment Method, Type, Phone Number, Transaction ID, Amount, Balance, Status। Search/column manager; method/type/status/device/date filters।
- Connect App entry point; New SMS Data form। Actual device pairing/session শুরু করা হয়নি।
- Automatic Entry form: device/method এবং copied SMS text। Manual Entry form খুলে দেখা: method/type, amount, phone, internal transaction ID, reference, note, status Awaiting Review/Approved/Used। কোনো receipt injected হয়নি। এটি operator tool; আমাদের normal customer flow-এর TrxID submission নয়।
- Devices: device ID/name/model, Android Version, App Version, Status। Account-এ device নেই; last-sync/reboot/offline handling যাচাই হয়নি।
- Balance Verification list: Device, method/type, current balance, Balance Verification, Smart Verification।
- Create form: Device/method/type/current balance; unique device-method-type combinations; balance verification ও smart verification switches। Helper বলে cash-out/send-money-এর পর balance manual update।
- “Smart Verification” AI-based delayed/missing SMS handling (3–5 transactions) দাবি করে। এটি UI claim; model, algorithm, confidence, false-positive behaviour বা five-field matcher পরীক্ষা হয়নি। Briofold-তে এসব switch/claim normal auto-verification opt-in হিসেবে যোগ হবে না।

### System Settings

- Text File: Filename/Type/Active list; create upload TXT/XML/HTML, active checkbox, public-access helper। No upload।
- Activities: Brand/User/Event/Subject/Description/Logged at; Filter/Column manager; Clear Activity Log action। No clear/export/mutation।

### Billing ও Profile

- Free plan, fund balance, payments usage/remaining/quota; displayed overage 0.008 USD/unit। এই observed account/date-এর UI value, pricing recommendation নয়।
- Active MFS Automation; gated Role Management, Bank Transfer, Brand Management, Custom Domain, Notification Management; external billing link। Paid-plan screens unavailable under current scope।
- Add Funds modal: 10/25/50/100/250/500/1000/2000 USD অথবা Custom; Submit হয়নি। Billing Histories: Date/Type/Description/Amount/Credits; empty।
- Profile: name/email/phone/password update; authenticator 2FA currently Disabled; passkey create; current browser sessions; Log Out Other Browser Sessions। কোনো security setting/credential/session পরিবর্তন হয়নি।

## Audit findings — কী গ্রহণ করব, কী সংশোধন করব

| Priority | Finding | Briofold-তে সিদ্ধান্ত |
|---|---|---|
| P0 | Browser UI real matching algorithm বা live payment success প্রমাণ করে না | Device evidence + unique five-field matcher + transaction/outbox tests অপরিহার্য |
| P0 | Manual receipt Approved ও invoice Paid inputs UI-তে আছে; actual permissions/accounting behaviour অজানা | Operator adjustments ও payment evidence আলাদা; no routine approval, no client-controlled paid truth |
| P1 | Current account default-email warning এবং 2FA Disabled দেখায় | Account owner-এর credentials/MFA setup বাকি; audit থেকে password default বা compromise দাবি নয় |
| P1 | Linked webhook example শুধু shared API-key check দেখায়; current implementation অজানা | Briofold signed payload + timestamp/event ID + replay-safe delivery অনুযায়ীই থাকবে |
| P2 | 17 integrations-এর মধ্যে coming-soon cards এবং Shopify empty download href | Available/needs setup/unsupported status স্পষ্ট; connector listing থেকে live capability দাবি নয় |
| P2 | “SMS Datas”, “Faqs”, “Shopifies” ইত্যাদি machine-style labels | Natural EN/BN language: SMS receipts, FAQs, Shopify connections; simple helper text |
| P2 | Empty lists mostly শুধু “No …”; account setup blocker context সীমিত | Relevant setup CTA, source status এবং পরবর্তী কাজ explain করতে হবে |
| P2 | Full admin EN/BN control দেখা যায়নি; checkout language আলাদা | Briofold public, AI, payment, admin—সব জায়গায় locale coverage required |
| Positive | Per-domain tabs/forms/columns; compact sidebar/header; readable light/dark layouts | AI এবং Payments-এর নিজস্ব grouped icon nav ও domain views |
| Positive | Explicit scoped API abilities, expiry, quota and connection screens | Permissions/entitlements server-enforced এবং lifecycle visible রাখতে হবে |

## Briofold dashboard direction

Payment overview-তে verified volume, pending requests, unmatched receipts, device health, webhook delivery failures ও setup progress থাকবে। AI overview-তে inbox, handover, leads, follow-ups ও usage। একই business/product switching থাকবে; এক product-এর operational menu অন্য product-এ মিশবে না।

Payment groups: Overview; Payments (transactions/requests/links/invoices/customers/refunds); Receiving sources (accounts/devices/incoming receipts/reconciliation); Commerce; Integrations & events; Workspace। Table বা tab তৈরি করলেই route complete নয়—real data, detail, authorized mutations, loading/error states ও applicable provider evidence লাগে। Existing canonical inventory-র feature বাদ বা নতুন reseller-product scope যোগ করা হয়নি।

## সীমাবদ্ধতা ও preserved state

Empty account-এ record detail/actions, customer checkout, actual sender/time matching, duplicate receipt, refund/partial refund, actual notifications, webhook signature/retries, import validation, authenticated tenant isolation, API requests, Android app reliability এবং paid-plan pages পরীক্ষা করা যায়নি। Identity verification start, pairing, gateway creation, theme activation, default-link generation, passkey/MFA setup ও billing submission execute করা হয়নি।

Theme preview reversible ছিল; শেষের System pressed state যাচাই হয়েছে। Final dashboard navigation timeout report করলেও subsequent URL ও Dashboard heading সফলভাবে original route নিশ্চিত করেছে। No repeated submit/retry। Mobile breakpoint বা full automated accessibility test করা হয়নি। Browser UI/labels থেকে backend framework/security architecture অনুমান করা হয়নি।

## Visual evidence

Light preview:

![Paymently light dashboard](F:/projects/ekmivo/docs/research/evidence/paymently/dashboard-light.png)

Original System theme restored:

![Paymently restored dashboard](F:/projects/ekmivo/docs/research/evidence/paymently/dashboard-restored-system.png)

Gateway chooser:

![Gateway choices](F:/projects/ekmivo/docs/research/evidence/paymently/gateway-chooser.png)

Payment-link form:

![Payment link creation](F:/projects/ekmivo/docs/research/evidence/paymently/payment-link-form.png)

