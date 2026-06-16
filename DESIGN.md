## Overview

Anthropic's visual identity is a deliberate counterpoint to the cold, dark-mode AI aesthetic. The base atmosphere is a **tinted cream canvas** (`{colors.canvas}` — #faf9f7) — warm off-white, never stark. Headlines run a **geometric grotesk display** ("Styrene A/B") at weight 500 with tight tracking (-0.03em), paired with **Styrene B / Inter** body sans at 17px with 1.65 line-height. The result feels more like a research institution than a tech company — careful, considered, and confident enough to be unhurried.

Brand voltage comes from the **cream + terracotta pairing** — terracotta (`{colors.primary}` — #c2522d) is the signature Anthropic accent, used sparingly on every primary CTA and generously on full-bleed callout cards. The terracotta is warm, rust-toned, never cyan/blue — a deliberate counter-positioning against OpenAI's cool slate, Google's saturated blue, and Microsoft's corporate cyan.

The system has three surface modes that alternate page-by-page:
1. **Cream canvas** (`{colors.canvas}`) — default body floor
2. **Light cream cards** (`{colors.surface-card}`) — feature card backgrounds
3. **Dark navy product surfaces** (`{colors.surface-dark}`) — code editor mockups, model showcase cards, pre-footer CTAs, footer itself

The dark surfaces are where Claude shows its product chrome — code blocks, terminal output, model comparison tables, agentic-flow diagrams. The cream-to-dark contrast is the page's pacing rhythm.

**Key Characteristics:**
- Warm cream canvas (`{colors.canvas}` — #faf9f7) with dark warm-ink text (`{colors.ink}` — #1a1a18). The brand's defining color choice.
- Terracotta primary CTA (`{colors.primary}` — #c2522d). Used sparingly on individual buttons, generously on full-bleed terracotta callout cards.
- Geometric grotesk display headlines via Styrene A/B at weight 500 with tight tracking (-0.03em). Pairs with humanist sans body for a literary editorial voice.
- Dark navy product mockup cards (`{colors.surface-dark}` — #181715) carrying code blocks, terminal panels, model comparison data — the brand shows the product chrome at scale rather than abstract marketing illustrations.
- Light cream feature cards (`{colors.surface-card}` — #e8e5e0) — slightly darker than canvas, used for content-driven feature explanations.
- Anthropic radial-spike mark — a small black asterisk-like glyph (4-spoke radial) — appears as the brand wordmark prefix and as a content marker.
- Border radius is hierarchical: `{rounded.md}` (8px) for buttons + inputs, `{rounded.lg}` (12px) for content + product cards, `{rounded.xl}` (16px) for the hero illustration container, `{rounded.pill}` for badges.
- Section rhythm `{spacing.section}` (96px) — modern-SaaS standard. Internal card padding stays generous at `{spacing.xl}` (32px).
- Motion is subtle and slow by tech standards: 120ms hover transitions, gentle scroll fade-ins. Philosophy matches the brand — thoughtful restraint over demonstrative animation.
- No dark mode. By offering only a warm light surface, Anthropic makes a legibility-forward commitment that avoids the "hacker AI aesthetic".

## Colors

### Brand & Accent
- **Terracotta / Primary** (`{colors.primary}` — #c2522d): The signature Anthropic rust/terracotta. Used sparingly on primary CTA backgrounds, on full-bleed terracotta callout cards, on the brand wordmark accent. Communicates humanistic warmth and intellectual honesty rather than machine precision.
- **Terracotta Active** (`{colors.primary-active}` — #a9583e): The press / hover-darker variant.
- **Terracotta Disabled** (`{colors.primary-disabled}` — #e6dfd8): A desaturated cream-tinted disabled state.
- **Accent Teal** (`{colors.accent-teal}` — #5db8a6): Used sparingly on secondary product surfaces (terminal status indicators, "active connection" dots in connectors page).
- **Accent Amber** (`{colors.accent-amber}` — #e8a55a): A small companion warm-tone used on category badges and inline highlights.

### Surface
- **Canvas** (`{colors.canvas}` — #faf9f7): The default page floor. Warm off-white — never stark. Reduces harshness for long-form reading of research papers and documentation.
- **Surface Soft** (`{colors.surface-soft}` — #f2f0ec): Section dividers, very-soft band backgrounds.
- **Surface Card** (`{colors.surface-card}` — #e8e5e0): Feature cards, content cards. One step darker than canvas.
- **Surface Cream Strong** (`{colors.surface-cream-strong}` — #e8e0d2): A strongest-cream variant used on selected category tabs and emphasized section bands.
- **Surface Dark** (`{colors.surface-dark}` — #181715): Code editor mockups, model showcase cards, footer. The dominant dark surface.
- **Surface Dark Elevated** (`{colors.surface-dark-elevated}` — #252320): Elevated cards inside dark bands (settings panels in mockups).
- **Surface Dark Soft** (`{colors.surface-dark-soft}` — #1f1e1b): Slightly lighter dark, used for code block backgrounds inside larger dark cards.
- **Hairline** (`{colors.hairline}` — #d8d4cc): The 1px border tone on cream surfaces. Soft, warm-toned separators.
- **Hairline Soft** (`{colors.hairline-soft}` — #ebe6df): Barely-visible divider used inside the same band.

### Text
- **Ink** (`{colors.ink}` — #1a1a18): All headlines and primary text. Warm near-black, never cold pure black.
- **Body Strong** (`{colors.body-strong}` — #252523): Emphasized paragraphs, lead text.
- **Body** (`{colors.body}` — #3d3d3a): Default running-text color.
- **Muted** (`{colors.muted}` — #6b6b63): Sub-headings, breadcrumbs, footer-adjacent secondary text. Desaturated warm gray.
- **Muted Soft** (`{colors.muted-soft}` — #8e8b82): Captions, fine-print, copyright lines.
- **On Primary** (`{colors.on-primary}` — #ffffff): Text on terracotta buttons.
- **On Dark** (`{colors.on-dark}` — #faf9f7): Cream-tinted white used on dark surfaces (echoes the canvas tone).
- **On Dark Soft** (`{colors.on-dark-soft}` — #a09d96): Footer body text, secondary labels in dark mockups.

### Semantic
- **Success** (`{colors.success}` — #5db872): Green status dots, "available" indicators.
- **Warning** (`{colors.warning}` — #d4a017): Warning callouts (rare on marketing surfaces).
- **Error** (`{colors.error}` — #c64545): Validation errors.

## Typography

### Font Family
The system runs **Styrene A/B** as the workhorse geometric grotesque with humanist qualities for all display and body text. **JetBrains Mono** handles code blocks. The fallback stack walks `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` for body.

The typography split:
- Styrene A/B (weight 500, tight tracking -0.03em) → h1, h2, h3, hero display — display sizes with compressed line-height
- Styrene B (weight 400-500) → body at 17px with 1.65 line-height, navigation, buttons, captions, labels — clearly intended for long-form reading of research and documentation
- JetBrains Mono → all code blocks and terminal text

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 64px | 500 | 1.05 | -0.03em | Homepage h1 — Styrene A/B grotesk |
| `{typography.display-lg}` | 48px | 500 | 1.1 | -0.03em | Section heads — Styrene A/B |
| `{typography.display-md}` | 36px | 500 | 1.15 | -0.03em | Sub-section heads, model names — Styrene A/B |
| `{typography.display-sm}` | 28px | 500 | 1.2 | -0.03em | Pricing tier names, callout headlines — Styrene A/B |
| `{typography.title-lg}` | 22px | 500 | 1.3 | 0 | Pricing plan size labels — Styrene B |
| `{typography.title-md}` | 18px | 500 | 1.4 | 0 | Feature card titles, intro paragraphs |
| `{typography.title-sm}` | 16px | 500 | 1.4 | 0 | Connector tile titles, list labels |
| `{typography.body-md}` | 17px | 400 | 1.65 | 0 | Default running-text — Styrene B (long-form reading config) |
| `{typography.body-sm}` | 14px | 400 | 1.55 | 0 | Footer body, fine-print |
| `{typography.caption}` | 13px | 500 | 1.4 | 0 | Badge labels, captions |
| `{typography.caption-uppercase}` | 12px | 500 | 1.4 | 1.5px | Category tags, "NEW" badges |
| `{typography.code}` | 14px | 400 | 1.6 | 0 | Code blocks — JetBrains Mono |
| `{typography.button}` | 14px | 500 | 1.0 | 0 | Standard button labels |
| `{typography.nav-link}` | 14px | 500 | 1.4 | 0 | Top-nav menu items |

### Principles
Display sizes use weight 500 (medium) with tight tracking (-0.03em). The geometric grotesk character is what gives Anthropic its considered, institutional voice — warmth comes from color and spacing, not decorative serifs.

Body type stays at weight 400 for paragraphs at 17px with 1.65 line-height — this is a long-form reading configuration, not a UI configuration. Anthropic publishes dense research documents and the Claude interface hosts long conversations. The generous body size signals that the company expects you to actually read, not skim, and that reading comfort is a product value. Weight 500 for labels and emphasized phrases.

### Note on Font Substitutes
If Styrene A/B is unavailable, **Inter** is the closest match — both are humanist sans designed for screen reading. **Söhne** is another close alternative if licensed.

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 96px.
- **Section padding:** `{spacing.section}` (96px) — modern-SaaS rhythm.
- **Card internal padding:** `{spacing.xl}` (32px) for feature cards, pricing tier cards, model comparison cards; `{spacing.lg}` (24px) for code-window cards and connector tiles.
- **Callout / CTA bands:** `{spacing.xxl}` (48px) inside coral callout cards; 64px inside the larger dark CTA band.

### Grid & Container
- **Max content width:** ~1200px centered.
- **Editorial body:** Single 12-column grid; hero often uses 6/6 split (h1 left, illustration right).
- **Feature card grids:** 3-up at desktop, 2-up at tablet, 1-up at mobile.
- **Connector tile grids:** 4-up or 6-up at desktop, 2-up at tablet, 1-up at mobile.
- **Pricing grid:** 3-up at desktop (Free / Pro / Team / Enterprise often), 1-up at mobile.

### Whitespace Philosophy
The cream canvas + grotesk display + generous internal padding create an editorial pacing — Claude reads like a long-form magazine column rather than a marketing template. Whitespace between bands stays uniform at 96px; whitespace inside cards is generous (32px), letting type breathe. The whitespace is a design decision: it signals unhurriedness and confidence, not emptiness.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, no border | Body sections, top nav, hero bands |
| Soft hairline | 1px `{colors.hairline}` border | Inputs, sub-nav, occasionally on cards |
| Cream card | `{colors.surface-card}` background — no shadow | Feature cards, content cards |
| Dark surface card | `{colors.surface-dark}` background — no shadow | Code editor mockups, model showcase cards |
| Subtle drop shadow | Faint shadow at low alpha | Hover-elevated states (the system uses `0 1px 3px rgba(20,20,19,0.08)` rarely) |

The elevation philosophy is **color-block first, shadow rare**. Most depth comes from the cream-vs-dark surface contrast. Shadows are minimal. The dark surface mockups have their own internal product chrome (code editor scrollbars, line numbers, syntax highlighting) which adds detail without needing external shadows.

### Decorative Depth
- The Anthropic spike-mark glyph (4-spoke radial asterisk) appears as a small black mark in the brand wordmark and inline as a content marker.
- Code editor mockups carry their own internal depth: syntax-highlighted text in muted blues / oranges / grays, line numbers in `{colors.muted-soft}`, status bars at the bottom in `{colors.surface-dark-elevated}`.
- Some hero illustrations use simple line-art with coral and dark-navy strokes on cream — minimal, hand-drawn-feeling, never photorealistic.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Reserved for badge accents and tiny dropdowns |
| `{rounded.sm}` | 6px | Small inline buttons, dropdown items |
| `{rounded.md}` | 8px | Standard CTA buttons, text inputs, category tabs |
| `{rounded.lg}` | 12px | Content cards (feature, pricing, code-window, model-comparison) |
| `{rounded.xl}` | 16px | Hero illustration container, the larger marquee components |
| `{rounded.pill}` | 9999px | Badge pills, "NEW" tags |
| `{rounded.full}` | 9999px / 50% | Avatar substitutes, icon buttons |

### Photography & Illustrations
Claude's hero rarely uses photography. Instead it uses:
- Simple line-art illustrations with coral + dark-navy strokes on the cream canvas
- Code editor mockups (the dominant "hero" treatment on developer-focused pages)
- Terminal output mockups with monospace text on dark
- Model comparison cards (Opus / Sonnet / Haiku) with abstract geometric thumbnails

When photography is used (rare — mostly testimonials), avatars crop to perfect circles at 40px diameter.

## Components

### Top Navigation

**`top-nav`** — Cream nav bar pinned to the top of every page. 64px tall, `{colors.canvas}` background. Carries the Anthropic spike-mark + "Claude" wordmark at left, primary horizontal menu (Product, Solutions, Use Cases, Pricing, Research, Company) center-left, right-side cluster with "Sign in" text-link, "Try Claude" `{component.button-primary}` (terracotta). Menu items in `{typography.nav-link}` (Styrene B 14px / 500).

### Buttons

**`button-primary`** — The signature terracotta CTA. Background `{colors.primary}` (#c2522d), text `{colors.on-primary}` (white), type `{typography.button}` (Styrene B 14px / 500), padding 12px × 20px, height 40px, rounded `{rounded.md}` (8px). Active state `button-primary-active` darkens to `{colors.primary-active}` (#a9583e).

**`button-secondary`** — Cream button with hairline outline. Background `{colors.canvas}`, text `{colors.ink}`, 1px hairline border, same padding + height + radius as primary.

**`button-secondary-on-dark`** — Used over `{colors.surface-dark}` cards. Background `{colors.surface-dark-elevated}` (#252320), text `{colors.on-dark}`. Stays dark — the system never inverts to a light secondary on dark surfaces.

**`button-text-link`** — Inline text button, no background. Used for "Sign in" in the top nav and inline CTA links.

**`button-icon-circular`** — 36px circular icon button. Background `{colors.canvas}`, hairline border, ink-color icon. Used for carousel arrows, share, "view more".

**`text-link`** — Inline body links in `{colors.primary}` (the terracotta). Underlined on press; the terracotta inline link is one of the system's most distinctive small details.

### Cards & Containers

**`hero-band`** — Cream-canvas hero with a 6-6 grid: h1 + sub-headline + button row on the left, hero illustration card or product mockup card on the right. Vertical padding `{spacing.section}` (96px).

**`hero-illustration-card`** — A larger card holding the hero's right-side artifact — sometimes a terracotta-stroke line illustration on cream background, sometimes a dark code editor mockup. Background `{colors.canvas}` or `{colors.surface-dark}` depending on context, rounded `{rounded.xl}` (16px).

**`feature-card`** — Used in 3-up feature grids. Background `{colors.surface-card}` (#e8e5e0 — slightly darker cream), rounded `{rounded.lg}` (12px), internal padding `{spacing.xl}` (32px). Carries a small icon at top, an `{typography.title-md}` headline, and a body description in `{typography.body-md}`.

**`product-mockup-card-dark`** — Dark navy card showing actual Claude product chrome (chat interface, code editor, agent controls). Background `{colors.surface-dark}`, rounded `{rounded.lg}`, internal padding `{spacing.xl}` (32px). Carries text labels in `{colors.on-dark}` and product UI fragments below.

**`code-window-card`** — A specialized dark card showing a code editor with line numbers, syntax-highlighted code in `{typography.code}` (JetBrains Mono), and sometimes a "Run" button or terminal output panel below. Background `{colors.surface-dark}` with `{colors.surface-dark-soft}` for the inner code block, rounded `{rounded.lg}`, padding `{spacing.lg}` (24px). The signature visual element of Claude Code product pages.

**`model-comparison-card`** — Used on the homepage's "Which problem are you up against?" section comparing Opus / Sonnet / Haiku. Background `{colors.canvas}` with hairline border, rounded `{rounded.lg}`, internal padding `{spacing.xl}` (32px). Carries the model name, a short capability blurb, and a `{component.text-link}` to learn more.

**`pricing-tier-card`** — Standard tier card. Background `{colors.canvas}` with hairline border, rounded `{rounded.lg}`, padding `{spacing.xl}` (32px). Carries the plan name in `{typography.title-lg}` (Styrene B), price in `{typography.display-sm}` (Styrene A/B grotesk), feature checklist in `{typography.body-md}`, and a `{component.button-primary}` at the bottom.

**`pricing-tier-card-featured`** — The featured tier (typically "Pro" or "Team"). Background flips to `{colors.surface-dark}`, text inverts to `{colors.on-dark}`. The dark surface IS the featured-tier signal.

**`callout-card-terracotta`** — A full-bleed terracotta card carrying a major call-to-action. Background `{colors.primary}` (#c2522d), text `{colors.on-primary}` (white), rounded `{rounded.lg}`, padding `{spacing.xxl}` (48px). The terracotta surface IS the voltage; the CTA inside uses an inverted button style (cream/canvas button on terracotta).

**`connector-tile`** — Used on the connectors page's integration grid. Background `{colors.canvas}` with hairline border, rounded `{rounded.lg}`, padding 20px. Each tile carries a logo at top, a `{typography.title-sm}` connector name, and a short description.

### Inputs & Forms

**`text-input`** — Standard text input. Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body-md}`, rounded `{rounded.md}` (8px), padding 10px × 14px, height 40px. 1px hairline border in `{colors.hairline}`.

**`text-input-focused`** — Focus state. Border thickens or shifts to `{colors.primary}` (terracotta) for emphasis. Carries a 3px terracotta-at-15%-alpha outer ring.

**`cookie-consent-card`** — Bottom-right floating dark cookie banner. Background `{colors.surface-dark}`, text `{colors.on-dark}`, rounded `{rounded.lg}`, padding `{spacing.lg}` (24px). One of the few places dark surface appears at small scale on cream pages.

### Tags / Badges

**`badge-pill`** — Small pill label used for category tags. Background `{colors.surface-card}`, text `{colors.ink}`, type `{typography.caption}` (13px / 500), rounded `{rounded.pill}`, padding 4px × 12px.

**`badge-coral`** — Coral-fill badge for "NEW", "BETA", featured highlights. Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.caption-uppercase}` (12px / 500 / 1.5px tracking), rounded `{rounded.pill}`, padding 4px × 12px.

### Tab / Filter

**`category-tab`** + **`category-tab-active`** — Used in sub-nav rows on solutions / connectors pages. Inactive: transparent background, `{colors.muted}` text. Active: `{colors.surface-card}` background, `{colors.ink}` text. Padding 8px × 14px, rounded `{rounded.md}`.

### CTA / Footer

**`cta-band-terracotta`** — A pre-footer "Try Claude" CTA card. Full-width terracotta fill, white type, rounded `{rounded.lg}`, padding 64px. Carries an h2 in `{typography.display-sm}` (Styrene A/B), a sub-line, and a cream-button CTA.

**`cta-band-dark`** — Alternative pre-footer band on developer-focused pages. Background `{colors.surface-dark}`, text `{colors.on-dark}`, rounded `{rounded.lg}`, padding 64px. Often pairs with a code-window card.

**`footer`** — Dark navy footer that closes every page. Background `{colors.surface-dark}` (#181715), text `{colors.on-dark-soft}`. 4-column link list at desktop covering Product / Company / Resources / Legal. Vertical padding 64px. The Anthropic spike-mark + "Anthropic" wordmark sits at the top in `{colors.on-dark}`. The footer never inverts.

## Do's and Don'ts

### Do
- Anchor every page on the cream canvas. Pure white reads as "any other AI tool"; the warm tint is the brand differentiator.
- Use Styrene A/B grotesk for every display headline at weight 500 with tight tracking (-0.03em). Pair with Styrene B sans body at 17px / 1.65.
- Reserve `{colors.primary}` (terracotta) for primary CTAs and full-bleed `{component.callout-card-terracotta}` moments. Don't paint accent moments terracotta elsewhere.
- Use `{component.product-mockup-card-dark}` and `{component.code-window-card}` to show actual Claude product chrome. Don't paint marketing illustrations of code when you can show real code.
- Pair `{component.feature-card}` (cream) with `{component.product-mockup-card-dark}` (navy) in alternating bands. The cream-to-dark rhythm is the brand's pacing mechanism.
- Use the Anthropic spike-mark glyph as the brand wordmark prefix. Never invert the mark to white-on-dark within the wordmark itself.
- Apply `{spacing.section}` (96px) between major bands.
- Use 120ms hover transitions and gentle scroll fade-ins. Respect `prefers-reduced-motion`.

### Don't
- Don't use cool grays or pure white for canvas. Cream is the brand.
- Don't use bold weights for display headlines. The system stays at 500 with tight tracking.
- Don't use cool blue or saturated cyan as a brand accent. The terracotta is the brand voltage.
- Don't put terracotta everywhere. The terracotta is scarce on individual elements and generous only on full-bleed terracotta callout cards.
- Don't repeat the same surface mode in two consecutive bands. The pacing alternates: cream → cream-card → dark-mockup → cream → terracotta-callout → dark-footer.
- Don't add aggressive hover state styling — primary darkens on press; hover color shifts are gentle (120ms). Always provide visible focus ring.
- Don't add dark mode. The warm light surface is a legibility-forward commitment.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Hamburger nav; hero h1 64→32px; hero-illustration-card stacks below content; feature grids 1-up; connector tiles 2-up; pricing 1-up; footer 4 cols → 1 |
| Tablet | 768–1024px | Top nav stays horizontal but tightens; feature cards 2-up; connector tiles 3-up; pricing 2-up |
| Desktop | 1024–1440px | Full top-nav with all menu items; 3-up feature cards; 4-up or 6-up connector tiles; 3-up pricing tiers |
| Wide | > 1440px | Same as desktop with more outer breathing room; max content width caps at 1200px |

### Touch Targets
- `{component.button-primary}` at minimum 40 × 40px.
- `{component.button-icon-circular}` at exactly 36 × 36 — slightly under WCAG 44 but visually centered.
- `{component.text-input}` height is 40px.
- Connector tile entire card area is tappable; effective tap area >> 44px.

### Collapsing Strategy
- Top nav collapses to hamburger at < 768px; menu opens as a full-screen cream sheet.
- Hero band's 6-6 grid collapses to single-column on mobile — h1 + sub-head + buttons first, then the illustration / mockup card below.
- Feature grids reduce columns rather than scaling cards down.
- Pricing tier cards collapse 4 → 2 → 1; featured-tier dark surface stays visually distinct at every breakpoint.
- Code-window cards retain code legibility at every breakpoint by allowing horizontal scroll within the card rather than wrapping code lines.

### Image Behavior
- Code blocks inside dark mockups stay at fixed font-size; horizontal scroll on mobile rather than wrapping.
- Hero illustrations scale proportionally; line-art strokes thin slightly on mobile.
- Avatar photos in testimonials crop to circles at every breakpoint.

## Iteration Guide

1. Focus on ONE component at a time. Reference its YAML key (`{component.feature-card}`, `{component.code-window-card}`).
2. Variants of an existing component (`-active`, `-disabled`, `-focused`) live as separate entries in `components:`.
3. Use `{token.refs}` everywhere — never inline hex.
4. Never document hover. Default and Active/Pressed states only.
5. Display headlines stay Styrene A/B 500 with tight tracking (-0.03em). Body stays Styrene B / Inter 400 at 17px / 1.65. The split is unbreakable.
6. Cream + terracotta + dark navy is the trinity. Don't introduce a fourth surface tone (no purple cards, no green sections).
7. When in doubt about emphasis: bigger Styrene A/B display before bolder weight.

## Known Gaps

- Styrene A/B is a licensed Anthropic typeface and not available as a public web font. Substitute (Inter) is documented in the typography section.
- The Anthropic radial-spike-mark is a brand glyph rendered as inline SVG; it's not formalized as a system token here. Treat it as a logo asset.
- Animation and transition timings (chat message reveal, code block typewriter effect on the homepage, agentic-flow diagram animations) are not in scope.
- Form validation states beyond `{component.text-input-focused}` are not extracted — error / success states would need a sign-up or feedback flow to confirm.
- The actual Claude product surface (claude.ai chat interface) shares some tokens with the marketing site but adds many product-specific components (chat bubbles, message tools, file upload chips, conversation history sidebar) that are out of scope for this marketing-surface document.
- The "agent" / "computer use" demo cards on certain pages display animated Claude controlling a browser — the static screenshot doesn't fully capture the animation chrome.

## Accessibility

### Contrast Ratios
- Primary on background (#c2522d on #faf9f7): 4.6:1 — passes AA, fails AAA
- Text on surface (#1a1a18 on #faf9f7): 17.2:1 — passes AA
- Muted on background (#6b6b63 on #faf9f7): 5.1:1 — passes AA (decorative)

### Minimum Requirements
- Touch target: 44×44px minimum for all interactive elements
- Focus indicator: #c2522d outline, 2px, 2px offset
- Focus contrast: 4.6:1 against #faf9f7 background

### Motion
- Respects `prefers-reduced-motion`: all hover transitions and scroll fade-ins should be suppressed
- All transitions use `@media (prefers-reduced-motion: reduce)` guard

### Notes
- The terracotta primary (#c2522d) narrowly passes AA at 4.6:1 on the warm canvas — verify at actual render sizes and do not rely on it for small text below 14px bold
- Muted ink (#6b6b63) passes AA but not AAA; avoid using it for critical instructional text
- Warm parchment canvas reduces harshness but also slightly lowers contrast vs pure white — test with users who have low vision
- Hover-only color shifts (120ms) carry no meaning for keyboard users; ensure all interactive states have a visible focus ring in addition to color change
