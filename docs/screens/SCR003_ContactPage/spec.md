# SCR003_ContactPage — Screen Spec

**Screen**: SCR003: ContactPage
**Type**: atomic
**Route**: `/contact`
**Generated**: 2026-06-06

## Purpose

Public visitors use this page to send a contact inquiry. They fill in their name, email, optional phone, and message, then receive a confirmation.

## Screen Layout

Two-column asymmetric grid (7 cols form + 5 cols info). Hero banner spans full width above the grid. No sticky header. Page wrapper has `overflow-x-hidden` (ContactSection.tsx:43). Left column: contact form card. Right column: 3 contact info cards + 1 partnership card.

### Layout Sketch

```
┌─────────────────────────────────────────────────┐
│ R1: Hero Banner (static)                       │
├───────────────────────────┬─────────────────────┤
│ R2: Contact Form (7 cols) │ R3: Info Cards      │
│                           │ (5 cols)            │
│                           ├─────────────────────┤
│                           │ R4: Partnership Card│
└───────────────────────────┴─────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Hero Banner | static | yes | Sparkles badge, h1, description | centered, max-w-3xl |
| R2 | Contact Form | static | yes | form with name/email/phone/message fields | full-width on sm, 7/12 cols on lg |
| R3 | Info Cards | static | yes | 3 ContactCard (Mail, Phone, MapPin) | 5/12 cols on lg, stacked below form on sm |
| R4 | Partnership Card | static | yes | badge, h3, p, CTA Link to `/register` | 5/12 cols on lg, below info cards |

## User Flow

### Happy Path

1. User navigates to `/contact` — sees hero banner
2. User scrolls to form — fills in name, email (required), phone (optional), message (required)
3. User clicks Gửi tin nhắn (Send Message) — `submitted` state becomes `true`; button text changes to "Đã gửi!"; form fields clear; after 3000ms `submitted` reverts to `false`; button reverts to original text

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `submitted === true` | form submitted | Button shows "Đã gửi!" + check icon, form cleared, 3s timer starts | `ContactSection.tsx:23,29-30` |
| 3s timer expires | `setTimeout` completes | `submitted` → `false`, button reverts to "Gửi tin nhắn" | `ContactSection.tsx:30` |

## Data Inventory

N/A — no read-only displayed fields. All fields are editable form inputs. Contact info (email/phone/address) is hardcoded static text, not dynamic data.

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| idle | page load, form not submitted | All 4 fields editable, button shows "Gửi tin nhắn" | fill fields, submit | `ContactSection.tsx:17-22,137-143` |
| submitted | `handleSubmit` fires | Button shows "Đã gửi!", fields cleared, Send icon hidden | none (waiting for timer) | `ContactSection.tsx:23-30,141-142` |
| reset | 3000ms timeout | Button reverts to "Gửi tin nhắn", Send icon shown | fill form again | `ContactSection.tsx:30` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| name | text | yes | not empty (HTML `required`) | none | browser default "Please fill out this field" |
| email | email | yes | valid email format (HTML `type="email"`) | none | browser default "Please include an @" |
| phone | tel | no | none | none | none |
| message | textarea | yes | not empty (HTML `required`) | none | browser default "Please fill out this field" |

### B) Server-side

N/A — no submit-style action handlers detected. Form submission is client-side only (`console.log` + state update, no API call). Source: `ContactSection.tsx:25-30`.

## Interaction Patterns

- **Typing in any field → `handleChange` updates `formData` state** — source: `ContactSection.tsx:33-40`
- **Clicking Send → `handleSubmit` fires, `submitted` becomes `true`, form clears, 3s auto-reset** — source: `ContactSection.tsx:25-30`
- **Clicking Mail contact card → opens `mailto:togiap.dev@gmail.com`** — source: `ContactSection.tsx:153-154`
- **Clicking Phone contact card → opens `tel:+84123456789`** — source: `ContactSection.tsx:159-160`
- **Clicking partnership CTA → navigates to `/register`** — source: `ContactSection.tsx:179-185`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `<label>` tags present for name/email/phone/message fields (`ContactSection.tsx:80-82,93-95,109-111,123-125`) — labels linked to inputs |
| Keyboard navigation | not implemented | No `keydown`/`tabindex` on submit button or form |
| Focus management | unmanaged | No `autofocus` on first field; no focus management after submit |
| Screen reader compatibility | unknown | Labels present; form has no `aria-describedby` for error messages |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `submitted === true` | local state | Submit button text = "Đã gửi!", Send icon hidden | normal button + icon | 3s auto-reset; form cleared simultaneously |
| `href` prop on ContactCard | data-driven | `<a>` wrapper with `href` | plain `<div>` wrapper | Mail and Phone cards link out; address card is static |

## Security Surface

N/A — no auth guards or permission checks detected on this screen.

## Source References

- Page/View: `examio-fe/src/pages/landing/ContactPage.tsx:1-5`
- ContactSection component: `examio-fe/src/components/organisms/ContactSection.tsx:1-228`