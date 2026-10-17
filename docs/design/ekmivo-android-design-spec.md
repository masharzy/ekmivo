# Ekmivo Android: Exact Design Spec (Jetpack Compose)

This file is the **pixel-level companion** to the main prompt. The visual reference is the interactive page `ekmivo-app-design.html` (also live at https://claude.ai/artifact/3762SwiFQWWnn5BD4ChZVy). Every number below is taken from that page's CSS. Open the HTML file and read its CSS: each class maps to a row in this spec.

---

> **Copy and data override.** All shop names, device names, amounts, counts, times, masked numbers, provider marks and sample codes in this file are **demo data** from the reference. Production values come from real data as listed in section 0a of the main prompt. Strings that name payment providers or make claims the product cannot guarantee are replaced by the approved copy in 0a. Layout, sizes, colours and animation below do not change.

## 0. Agent contract (read first, non-negotiable)

1. The reference is the design. You do not redesign, "improve", simplify, reorder, rename, re-colour or add elements. A screen that differs from the reference is **a failed screen**, even if it works.
2. Jetpack Compose can reproduce every screen exactly. "Hard in Kotlin" is not an acceptable reason for a deviation. If you believe something is impossible, say which line of this spec and why, and propose the closest exact alternative. Do not silently substitute.
3. **Do not use Material 3 components as they ship.** No `NavigationBar`, `Card`, `ElevatedCard`, `Button`, `FilterChip`, `SegmentedButton`, `ListItem`, `Switch`, default `ModalBottomSheet` styling. Build the small custom composables in section 5 and use them everywhere. Material may be used only as plumbing (theme host, `ModalBottomSheet` with `containerColor`, `shape`, and `dragHandle = null` overridden to the spec).
4. No elevation, shadows, gradients, tonal surface tint, or default ripple colours. Flat surfaces with 1dp hairlines only. Set `MaterialTheme` colours so nothing falls back to purple or tonal defaults.
5. Work **one screen at a time** and follow the verification loop in section 7. Do not start the next screen until the current one matches.
6. Copy is fixed **except where the main prompt's section 0a overrides it**. 0a replaces provider names, inaccurate claims and all demo data, and its approved replacement strings win over any string in this file. Everything else: use the exact Bangla strings, in `strings.xml`.

---

## 1. How reference units map to the app

The reference phone frame is 288 wide inside a 300 frame, drawn in CSS px. Treat **1 px = 1 dp** for sizes and **1 px = 1 sp** for text.

- Horizontal screen padding is a fixed **16dp**.
- Containers (cards, rows, buttons, stat tiles) are **fluid**: `fillMaxWidth`, with the internal fixed sizes below.
- Fixed-size elements (logo tile, provider tile, hero ring, icon tiles, scanner frame, pills) keep their dp size on every device.
- On taller real screens, extra height appears **below the feed**. The Home body (hero, stats, feed) scrolls as one list; the bottom nav is pinned.
- Test widths: 360dp and 412dp. Both must look like the reference.

---

## 2. Tokens (single source, `EkmivoTokens.kt`)

All colours below are the reference palette. Where the web dashboard defines the same role (background, surface, border, text, success, warning, error), **use the web's value and keep the structure**. Never invent a new role.

### Dark (reference, exact)

| Token | Hex | Use |
|---|---|---|
| bg | `#0F0F0E` | screen background |
| s1 | `#181817` | cards, stat tiles, hero core, icon tiles, chips |
| s2 | `#222220` | selected nav pill, bottom sheet, segment tag background |
| border | `#2C2C29` | every hairline and outline |
| text | `#F1F0EA` | primary text, primary button background, logo tile |
| muted | `#8D8B84` | secondary text, icons |
| ok | `#3DDC97` | live dot, pulse ring, success values |
| warn | `#F5B544` | pending, "Fix" values |
| err | `#F2685B` | failed, disconnected, destructive |
| okBg / warnBg / errBg | `#12301F` / `#33260D` / `#3A1B18` | status tag backgrounds |
| provider mark | from server sender profile; reference shows `#D12053` / `#E2262D` as examples only | provider tiles (white text). Unknown sender: s2 background, muted initials |
| scanBg | `#0A0A09` | camera viewport background |
| onPrimary | `#111111` | text on cream buttons and logo tile |

### Light (not drawn in the reference: derive, then confirm against the web)

Same roles, same structure, same sizes. Proposed starting values: bg `#F4F3EE`, s1 `#FFFFFF`, s2 `#ECEBE5`, border `#DDDCD5`, text `#1B1B19`, muted `#6B6A64`, primary button background `#1B1B19` with text `#F4F3EE`, okBg `#DDF5E8`, warnBg `#FBEFD3`, errBg `#FBE0DC`, status text colours darkened for contrast (ok `#0F7A4B`, warn `#8A5A00`, err `#B3382C`). Replace with web tokens where they exist.

### Radii (dp)
logo tile 10 · provider tile 9 · stat tile 12 · rows of settings in card 0 (card is 14) · card 14 · button 14 · icon tile 24 · nav selected pill 12 · chips and tags and segments pill (fully rounded) · scanner viewport 20 · bottom sheet top corners 24 · wizard progress bar 2.

### Stroke
Hairline and outlines: **1dp**, colour `border`. Icon stroke 1.8dp. Scanner corners 2.5dp.

### Typography (sp). Weights: Regular 400, Medium 500 only
| Role | Size | Weight | Line height |
|---|---|---|---|
| shop name | 14 | 500 | 1.2 (17sp) |
| sub / device / meta / labels | 11 | 400 | default 1.4 |
| hero amount | 22 | 500 | 1.2 |
| hero note | 12 | 400 | 1.5 |
| stat number | 17 | 500 | 1.2 |
| section header | 11 | 400 | 1.4 |
| row amount | 14 | 500 | 1.25 |
| tag text | 11 | 400 | 1.2 |
| nav label | 11 | 400 | 1.2 |
| button | 15 | 500 | 1.2 |
| link | 13 | 400 | 1.4 |
| screen title (center screens) | 19 | 500 | 1.5 (28.5sp) |
| body paragraph | 13 | 400 | 1.7 (22sp) |
| settings row | 13 | 400 | 1.4 |
| segmented pill | 12 | 400 | 1.2 |
| settings screen title | 17 | 500 | 1.2 |

Font: use the web's Bangla-capable font if it has one; otherwise bundle **Hind Siliguri** (Regular and Medium), which the reference uses. Set `includeFontPadding = false` and explicit `lineHeight`. Bangla headings must never clip: check conjuncts at 19sp.
Amounts use tabular numerals where the font supports `tnum`.

---

## 3. Screens: exact structure

Notation: `pad(top, horizontal, bottom)`, `gap` = spacing between children, all dp.

### 3.1 Shared header row (Home, Disconnected, Settings, Pairing)
- Row, `pad(16, 16, 8)`, vertically centered, gap 10.
- Logo tile: 34 x 34, radius 10, background `text` (cream), centered "e." 16sp / 500, colour onPrimary.
- Column: shop name (14/500, lh 1.2) over device name (11, muted).
- Right-aligned **connection chip**: row, gap 6, `pad(4, 10)`, pill, 1dp border, background s1, text 11sp. Leading dot 7 x 7, colour ok, alpha animates 1 → 0.35 → 1 over 1.6s, infinite. The chip text and dot follow `ConnectionState`. In Disconnected the chip has no dot, text colour err, label "বিচ্ছিন্ন".

### 3.2 Home
1. Header (3.1) with chip "লাইভ".
2. **Hero**: column, centered, `pad(10, 16, 6)`.
   - Ring box 136 x 136, margin top 10, bottom 12.
   - Two outline rings (1dp, colour ok) filling the box, each animating scale 0.8 → 1.25 and alpha 0.5 → 0 over 2800ms, easing `CubicBezier(0.25, 0.1, 0.25, 1)`; second ring offset by 1400ms. Disable under reduced motion.
   - Core circle 112 dp, background s1, 1dp border, centered column: amount "৳১২,৪৫০" (22/500), label "আজ যাচাই হয়েছে" (11, muted, top margin 2).
   - Beneath: note "শেষ SMS ২ মিনিট আগে পাঠানো হয়েছে" (12, muted, centered).
3. **Stats row**: `pad(12, 16, 4)`, gap 8, three equal-weight tiles, each background s1, radius 12, `pad(9, 10)`: number (17/500; the third, failed, in err) over label (11, muted). Labels: পাঠানো, অপেক্ষায়, ব্যর্থ. Values: ১৮, ১, ১.
4. **Section header** "সাম্প্রতিক পেমেন্ট": 11, muted, `pad(12, 16, 6)`.
5. **Feed rows** (3 in the reference): row `pad(9, 16)`, gap 10, a top hairline (1dp border) on every row.
   - Provider tile 30 x 30, radius 9, provider colour, white text 11/500 (sender initials from the server profile), centered.
   - Middle column (weight 1): amount (14/500, lh 1.25) over sub-line (11, muted) "••••৪৮২১, ২ মি আগে".
   - Right: status tag, pill, `pad(3, 8)`, 11sp: sent = okBg/ok "পাঠানো হয়েছে", sending = warnBg/warn "পাঠানো হচ্ছে", retry = errBg/err "আবার চেষ্টা".
   - Demo data only, not production (see 0a): ৳১,২০০ bKash ••••৪৮২১ ২ মি আগে sent; ৳৮৫০ Nagad ••••৯৩০৭ ১১ মি আগে sending; ৳২,৩০০ bKash ••••১২৫৫ ২৪ মি আগে retry.
6. **Bottom nav** (3.6), selected = Live.

### 3.3 Pairing
1. Header variant: logo tile, column "ফোন যুক্ত করুন" (14/500) over "ড্যাশবোর্ডের QR স্ক্যান করুন" (11, muted). No chip.
2. **Scanner viewport**: weight 1, margin `(10, 16)`, radius 20, background scanBg, 1dp border. Camera preview sits inside, **dimmed to 55% opacity once a code is detected** (the reference shows the dimmed state with the sheet).
3. Centered scanner frame 150 x 150: four corner brackets, length 26, stroke 2.5, colour `text`, corner radius 10 (outer corners only).
4. **Consent sheet** (anchored to bottom): background s2, top corners 24, top hairline 1dp, `pad(18, 18, 22)`.
   - Row, gap 10, margin bottom 10: shop avatar 34 x 34 radius 10 (shop colour, white 13sp text, e.g. "রি"), column shop name (14/500) over "স্ক্যান সফল হয়েছে" (11, muted).
   - Paragraph (13 / lh 1.7 / muted, margin bottom 14): the approved consent text from 0a ("Ekmivo এই ফোনে আসা SMS দেখে শুধু পেমেন্টের SMS **{দোকানের নাম}**-এ পাঠাবে। বাকি SMS পাঠানো বা সংরক্ষণ করা হবে না।") The shop name is Medium weight in `text` colour.
   - Primary button "নিশ্চিত করে যুক্ত করুন".
   - Link "বাতিল" (13, muted, centered, top padding 10).
5. **Before a code is detected** (the Scan screen): same header, no sheet, viewport at full opacity, a torch pill at top-right of the viewport (11sp, `pad(4, 10)`, 1dp border, background s1, muted, inset 12), the frame, and a hint under the frame (12sp, muted, gap 16): "ড্যাশবোর্ডের QR কোড ফ্রেমে ধরুন". Beneath the viewport a link "কোড দিয়ে যুক্ত করুন" (13, muted, centered) in the bottom area `pad(0, 20, 24)`. **No shop name appears anywhere on this screen: the app does not know it yet.**
6. The header on every pre-pairing screen is the generic one (logo tile, "ফোন যুক্ত করুন", "ড্যাশবোর্ডের QR স্ক্যান করুন"). The shop name appears for the first time in the consent sheet, after the QR payload or the server's code validation provides it.

### 3.3a First-launch screens (exact order; reference page mode "প্রথমবার সেটআপ")

1. **Welcome.** Header: logo tile + "Ekmivo" (14/500), no chip. Center column (padding 24): icon tile 76 (phone icon), title "ফোনটি Ekmivo-র সাথে যুক্ত করুন" (19/500), body "এই ফোনে আসা পেমেন্টের SMS নিজে থেকে Ekmivo-তে পাঠানো হবে।" Then a card (s1, radius 14, top margin 20, full width) with three rows, each `pad(10, 12)`, gap 10, 13sp, left-aligned, top hairline except first: a 20dp numbered circle (1dp border, 11sp, muted) and the text the real flow's steps (main prompt 3.3c; the three rows on the reference page are placeholders). Bottom `pad(0, 20, 24)`: primary "QR স্ক্যান করুন", link "কোড দিয়ে যুক্ত করুন".
2. **Camera permission** (skipped if already granted). Generic header, scanner viewport (same box as Scan) containing a centered icon tile 76 (camera icon), title "ক্যামেরা চালু করুন" (19/500, bottom margin 6), body "QR কোড স্ক্যান করতে ক্যামেরা লাগবে। কোনো ছবি সংরক্ষণ করা হয় না।" Bottom: primary "অনুমতি দিন", link "কোড দিয়ে যুক্ত করুন".
3. **Scan.** As 3.3 item 5.
4. **Confirm.** As 3.3 items 2 to 4 (viewport dimmed to 55%, consent sheet). Appears automatically after a successful scan.
5. **Connecting.** Generic header. Center column: icon tile 76 containing a 34dp spinner (3dp ring in border colour, top arc in `text`, 1s linear rotation), title "যুক্ত হচ্ছে…" (19/500), body "{দোকানের নাম}-এর সাথে যুক্ত করা হচ্ছে।" (shop name is known here). No buttons.
6. **Permission wizard**, steps in this order, layout as 3.4, progress bars filled 1 to 4 for steps 1 to 4:
   - Step 1 SMS: msg icon, "পেমেন্ট SMS পড়তে দিন", "এই ফোনে আসা পেমেন্টের SMS চিনে Ekmivo-তে পাঠাতে এই অনুমতি দরকার। বাকি SMS পাঠানো হবে না।" Button "অনুমতি দিন".
   - Step 2 Notifications: bell icon, "নোটিফিকেশন চালু করুন", "ফরওয়ার্ডিং চালু আছে কি না, আর কোনো SMS ব্যর্থ হলে সেটা জানাতে নোটিফিকেশন দরকার।" Button "অনুমতি দিন".
   - Step 3 Battery: battery icon, "ব্যাকগ্রাউন্ডে চালু রাখুন", "স্ক্রিন বন্ধ থাকলেও যেন কোনো পেমেন্ট SMS মিস না হয়, তাই ব্যাটারি সীমাবদ্ধতা থেকে Ekmivo-কে ছাড় দিন।" Button "অনুমতি দিন".
   - Step 4 Samsung guide (Samsung devices only): phone icon, "স্লিপিং অ্যাপ তালিকা থেকে সরান", "Samsung ফোনের ব্যাটারি সেটিংসে Ekmivo-কে ‘স্লিপিং অ্যাপ’ ও ‘ডিপ স্লিপিং অ্যাপ’ তালিকা থেকে সরিয়ে রাখুন। নইলে স্ক্রিন বন্ধ থাকলে SMS থেমে যেতে পারে।" Button "সেটিংস খুলুন", link "করেছি, এগিয়ে যান".
   - Status tags row (SMS, নোটিফিকেশন, ব্যাটারি): pending = background s2, muted; done = okBg, ok, with " ✓". Steps for already-granted permissions are skipped.
7. **Done.** Header: logo tile + shop name. Center: icon tile with a check icon in `ok` colour, title "সব ঠিক আছে", body "{দোকানের নাম}-এর পেমেন্ট SMS এখন থেকে নিজে থেকে Ekmivo-তে পাঠানো হবে।" Bottom: primary "শুরু করুন" (goes to Home).

### 3.3b Code entry (alternative path)
Generic header with sub-line "কোড দিয়ে". Top-aligned column, top padding 36: title "পেয়ারিং কোড লিখুন" (19/500), body "ড্যাশবোর্ডের ‘ফোন যুক্ত করুন’ পেজে কোডটি দেখাবে।" Eight cells 26 x 38, radius 8, 1dp border, background s1, 15sp/500, gap 6, split 4 + 4 by a dash; the active cell has a `text`-coloured border. Top margin 20. Bottom: primary "কোড যাচাই করুন", link "QR স্ক্যান করুন". After verification: the same consent sheet with the shop name from the server.

### 3.4 Permission wizard
- Progress: row, centered, gap 6, top padding 18; four bars 22 x 4, radius 2; done = `text`, remaining = border. (Reference shows 3 done, 1 remaining.)
- Center column (weight 1, centered, horizontal padding 24):
  - Icon tile 76 x 76, radius 24, background s1, 1dp border, icon 32dp, bottom margin 18.
  - Title "ব্যাকগ্রাউন্ডে চালু রাখুন" (19/500, lh 1.5), bottom margin 8.
  - Body "স্ক্রিন বন্ধ থাকলেও যেন কোনো পেমেন্ট SMS মিস না হয়, তাই ব্যাটারি সীমাবদ্ধতা থেকে Ekmivo-কে ছাড় দিন।" (13 / lh 1.7 / muted, centered).
  - Tag row, top margin 18, gap 8: "SMS ✓" okBg/ok, "নোটিফিকেশন ✓" okBg/ok, "ব্যাটারি" background s2 / muted. Tags reflect real progress.
- Bottom: `pad(0, 20, 24)`: primary button "অনুমতি দিন", link "কেন দরকার?" (13, muted, centered, pad 10) that expands a short explanation.
- Wizard steps (in order): SMS, notifications, battery exemption, OEM guide. Each step uses this same layout with its own icon, title, body.

### 3.5 Disconnected
- Header with err chip (3.1).
- Center column as in the wizard: icon tile (icon colour **err**), title "এই ফোন ড্যাশবোর্ড থেকে বিচ্ছিন্ন", body "ওয়েব থেকে ডিভাইসটি সরানো হয়েছে। আবার যুক্ত করলেই SMS পাঠানো শুরু হবে।"
- Bottom `pad(0, 20, 24)`: primary button "আবার যুক্ত করুন" (goes straight to pairing), link "২টি অপ্রেরিত SMS দেখুন". No retry button. No nav bar on this screen.

### 3.6 Bottom nav (Home and Settings)
- Top hairline 1dp, background bg, `pad(8, 24, 14)` plus system navigation inset, items evenly spaced (space-around).
- Item: column, centered, gap 3, `pad(4, 18)`, radius 12, label 11sp, icon 20dp. Unselected: muted colour, no background. **Selected: `text` colour and background s2.** No indicator line, no elevation.
- Two items only: লাইভ (activity icon), সেটিংস (sliders icon). Inbox is hidden behind `inboxEnabled`.

### 3.7 Settings
- Header: logo tile + title "সেটিংস" (17/500).
- Cards: background s1, radius 14, horizontal margin 16, bottom margin 10, clip content. Rows: `pad(10, 14)`, gap 10, 13sp, a 1dp top hairline on every row except the first; leading icon 17dp muted; trailing value 12sp muted, pushed right.
- Order and content:
  1. Top margin 6. Card "device": row store icon "রহিম ফ্যাশন" + value "Galaxy A54"; row refresh icon "শেষ সিঙ্ক" + value "২ মিনিট আগে".
  2. Section header "নির্ভরযোগ্যতা" (11, muted, `pad(6, 16, 6)`). Card: message icon "SMS অনুমতি" value "চালু" in ok; bell icon "নোটিফিকেশন" value "চালু" in ok; battery icon "ব্যাটারি ছাড়" value "ঠিক করুন ›" in warn (opens the wizard step). Values reflect real state.
  3. Section header "অ্যাপ" (11, muted, `pad(2, 16, 6)`). Card: row "ভাষা" with segmented pills [বাংলা | English]; row "থিম" with segmented pills [সিস্টেম | লাইট | ডার্ক]; row file-text icon "ডায়াগনস্টিক ও লগ" value "›".
  4. Destructive card: single centered row, text "ফোন বিচ্ছিন্ন করুন" in err. Tapping opens a confirmation sheet explaining consequences.
- Segmented pills: gap 6, right-aligned; each pill `pad(4, 10)`, 12sp, 1dp border, muted text; **selected: background `text`, text onPrimary, border `text`**.
- Bottom nav with Settings selected.

### 3.8 Primary button (global)
Full width, height 46, radius 14, background `text`, text onPrimary 15/500 centered, no border, no elevation. Pressed state: reduce to 88% alpha, nothing else. Only **one** primary button per screen.

---

## 4. Icons
Use one **outlined, 1.8dp stroke, round caps** set: Tabler or Lucide, imported as vector drawables (not Material Icons). Mapping: activity, sliders-horizontal, battery, circle-x, store, refresh-cw, message-square, bell, file-text. Sizes: nav 20dp, settings rows 17dp, icon tiles 32dp.

---

## 5. Reference composables for the hard parts

These are **reference implementations** of the tricky pieces. Adapt names; keep the geometry and numbers.

```kotlin
// Hairline on top of any row
fun Modifier.topHairline(color: Color) = drawBehind {
    drawLine(color, Offset(0f, 0f), Offset(size.width, 0f), strokeWidth = 1.dp.toPx())
}

// Pulse ring (two staggered rings around the hero core)
@Composable
fun PulseRing(color: Color, modifier: Modifier = Modifier, core: @Composable () -> Unit) {
    val t = rememberInfiniteTransition(label = "pulse")
    @Composable
    fun Ring(offsetMs: Int) {
        val p by t.animateFloat(
            initialValue = 0f, targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(2800, easing = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)),
                repeatMode = RepeatMode.Restart,
                initialStartOffset = StartOffset(offsetMs, StartOffsetType.FastForward)
            ), label = "ring$offsetMs"
        )
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer { val s = 0.8f + 0.45f * p; scaleX = s; scaleY = s; alpha = 0.5f * (1f - p) }
                .border(1.dp, color, CircleShape)
        )
    }
    Box(modifier.size(136.dp), contentAlignment = Alignment.Center) {
        Ring(0); Ring(1400); core()
    }
}

// Scanner corner brackets (150dp frame, 26dp arms, 10dp radius, 2.5dp stroke)
@Composable
fun ScannerFrame(color: Color) = Canvas(Modifier.size(150.dp)) {
    val len = 26.dp.toPx(); val r = 10.dp.toPx(); val w = size.width; val h = size.height
    val st = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round)
    drawPath(Path().apply { moveTo(0f, len); lineTo(0f, r); arcTo(Rect(0f, 0f, 2*r, 2*r), 180f, 90f, false); lineTo(len, 0f) }, color, style = st)
    drawPath(Path().apply { moveTo(w-len, 0f); lineTo(w-r, 0f); arcTo(Rect(w-2*r, 0f, w, 2*r), 270f, 90f, false); lineTo(w, len) }, color, style = st)
    drawPath(Path().apply { moveTo(w, h-len); lineTo(w, h-r); arcTo(Rect(w-2*r, h-2*r, w, h), 0f, 90f, false); lineTo(w-len, h) }, color, style = st)
    drawPath(Path().apply { moveTo(len, h); lineTo(r, h); arcTo(Rect(0f, h-2*r, 2*r, h), 90f, 90f, false); lineTo(0f, h-len) }, color, style = st)
}

// Status tag
@Composable
fun StatusTag(text: String, bg: Color, fg: Color) = Text(
    text, color = fg, style = Tok.Type.tag,
    modifier = Modifier.background(bg, CircleShape).padding(horizontal = 8.dp, vertical = 3.dp)
)

// Custom nav item (no Material NavigationBar)
@Composable
fun NavItem(label: String, icon: Painter, selected: Boolean, onClick: () -> Unit) {
    val c = if (selected) Tok.text else Tok.muted
    Column(
        Modifier.clip(RoundedCornerShape(12.dp))
            .background(if (selected) Tok.s2 else Color.Transparent)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)
    ) { Icon(icon, null, tint = c, modifier = Modifier.size(20.dp)); Text(label, color = c, style = Tok.Type.nav) }
}

// Segmented pill
@Composable
fun Pill(label: String, selected: Boolean, onClick: () -> Unit) = Text(
    label, style = Tok.Type.seg, color = if (selected) Tok.onPrimary else Tok.muted,
    modifier = Modifier
        .background(if (selected) Tok.text else Color.Transparent, CircleShape)
        .border(1.dp, if (selected) Tok.text else Tok.border, CircleShape)
        .clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 4.dp)
)

// Primary button
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) = Box(
    modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp))
        .background(Tok.text).clickable(onClick = onClick),
    contentAlignment = Alignment.Center
) { Text(text, color = Tok.onPrimary, style = Tok.Type.button) }
```

Text styles are plain `TextStyle` values built from the table in section 2, with `platformStyle = PlatformTextStyle(includeFontPadding = false)` and `lineHeight` set in sp.

---

## 6. Things that must not appear

Material `NavigationBar` or its indicator pill · elevation or shadow on anything · default `Card` or `Button` · ripple on nav items and pills in a colour other than a faint neutral · gradient backgrounds · extra icons, badges, dividers, headers, or helper text not in the reference · any text that differs from the reference copy · centered Home hero stretched wider than 136dp · bold weights (600/700) · different corner radii "for consistency" · a retry button on the Disconnected screen · an Inbox tab.

---

## 7. Verification loop (mandatory, per screen)

1. Add **screenshot tests** (Roborazzi or Paparazzi) for each screen at 360dp and 412dp wide, dark and light, Bangla. Also run on an emulator.
2. Open the reference page, tap the screen's chip, and capture a screenshot of that screen. Put it next to your screenshot. (Reference screens: Home, Pairing, Wizard, Disconnected, Settings.)
3. Fill this table in your reply for the screen. Every row must read "match" before you continue:

| Element | Spec value | Your value | Match |
|---|---|---|---|
| Header height and logo tile | 34dp, radius 10 | | |
| Hero ring and core | 136 / 112dp | | |
| Typography sizes and weights | section 2 | | |
| Spacing (paddings, gaps) | section 3 | | |
| Colours | section 2 | | |
| Hairlines and radii | 1dp, section 2 | | |
| Copy (Bangla strings) | exact | | |
| Nav bar (selected pill) | section 3.6 | | |

4. If any row does not match, fix it and repeat. Do not proceed with "close enough".
5. Finish with a final side-by-side of all five screens and a list of any intentional deviation with the reason. An empty list is expected.

---

## 8. Definition of done

All five screens match the reference at 360dp and 412dp in dark mode, the light theme uses the same structure with web-derived colours, every state in `ConnectionState` renders through these same components, and the verification tables are all "match".