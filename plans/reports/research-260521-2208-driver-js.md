---
title: "Study Report: Driver.js"
date: "2026-05-21 22:08 Asia/Saigon"
type: "research"
topic: "Driver.js installation, usage, configuration, React/Vite integration"
sources_consulted: 4
---

# Study Report: Driver.js

## Summary

Driver.js is a lightweight MIT-licensed JavaScript library for product tours, guided onboarding, and element highlights. Current npm version checked locally is `1.4.0`. It works with plain JS and bundled apps; in React/Vite, usage is direct: install `driver.js`, import CSS once, then create/destroy driver instances around DOM elements.

For Examio frontend, Driver.js is suitable for short onboarding flows: dashboard first-run tour, exam-room guidance, AI chat/document upload tutorial. Keep tours explicit and small. Avoid overusing tours for core UX issues; if users need many tour steps to understand a page, improve UI copy/layout first.

Recommendation: add a small wrapper hook/service in `examio-fe` to centralize CSS import, default config, localStorage completion state, and cleanup. Use stable selectors via `data-tour="..."`, not brittle Tailwind/class selectors.

## Study Methodology

- Sources consulted: 4
- Timestamp: 2026-05-21 22:08 Asia/Saigon
- Key search terms: Driver.js installation, Driver.js configuration, Driver.js basic usage, driver.js npm latest version
- Scope: install, basic API, config, React/Vite integration, risks, suggested implementation pattern

## Key Findings

### 1. Technology Overview

Driver.js provides:

- Single-element highlight via `driverObj.highlight(...)`
- Multi-step product tours via `steps` + `driverObj.drive()`
- Overlay/cutout around target element
- Popover with title, description, placement, buttons, progress
- Hooks for render/highlight/navigation/destroy lifecycle

Basic bundled usage:

```ts
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const driverObj = driver({
  showProgress: true,
  steps: [
    {
      element: "[data-tour='dashboard-upload']",
      popover: {
        title: "Upload tài liệu",
        description: "Thêm tài liệu để Examio tạo flashcard, quiz và hỗ trợ AI chat.",
      },
    },
  ],
});

driverObj.drive();
```

Package install:

```bash
yarn add driver.js
# or npm install driver.js / pnpm install driver.js
```

CDN usage exists, but not recommended for `examio-fe` because the app already uses Vite bundling.

### 2. Current State & Trends

- npm package: `driver.js`
- Latest version from `npm view`: `1.4.0`
- License: MIT
- Repository: `https://github.com/kamranahmedse/driver.js.git`
- Dependencies returned by npm metadata: none listed
- Docs include install, basic usage, configuration, theming, examples, and migration from 0.x

The library is mature enough for onboarding. Its API is small and framework-agnostic, so integration cost is low.

### 3. Established Practices

- Use `data-tour` selectors instead of class names.
- Import `driver.js/dist/driver.css` once near app entry or a tour module.
- Centralize default config: overlay, buttons, labels, progress, theme class.
- Store completed tour keys in `localStorage` so first-run tours do not repeat.
- Delay tour start until target elements are mounted.
- Keep each tour to 3-6 steps. Long tours hurt retention.
- Use `destroy()`/cleanup on route change or component unmount.
- For async pages, check targets exist before starting; otherwise skip or retry briefly.
- Override button text for Vietnamese UX: `nextBtnText`, `prevBtnText`, `doneBtnText`.

### 4. Configuration Notes

Important Driver.js options:

| Option | Use |
| --- | --- |
| `steps` | Multi-step tour definitions |
| `showProgress` | Show `{{current}} of {{total}}` progress |
| `progressText` | Customize progress label |
| `animate` | Enable animation, default true |
| `smoothScroll` | Scroll target into view smoothly |
| `allowClose` | Allow closing via overlay/backdrop |
| `allowKeyboardControl` | Enable keyboard navigation |
| `disableActiveInteraction` | Prevent clicks on highlighted element |
| `popoverClass` | Add custom CSS class |
| `overlayColor` / `overlayOpacity` | Customize backdrop |
| `stagePadding` / `stageRadius` | Control highlight cutout spacing/rounding |
| `showButtons` | Control visible buttons |
| `onDestroyed` | Persist completion or analytics |

Important warning: if overriding `onNextClick` or `onPrevClick`, call `driver.moveNext()` or `driver.movePrevious()` manually. Otherwise navigation will stop.

### 5. Security Considerations

- Do not inject untrusted HTML into popover content. Use static strings or sanitized content.
- Avoid exposing sensitive data in tour text, selectors, or analytics payloads.
- If tour state syncs to backend later, validate user identity and tour key server-side.
- Avoid selectors that reveal internal implementation or user IDs.
- Do not use CDN in production app unless pinned version + CSP/SRI are handled.

### 6. Performance Characteristics

- Driver.js is client-side and DOM-driven. Main cost is layout calculation, overlay rendering, scrolling, and event listeners.
- Keep tours short and instantiate only when needed.
- Do not create global driver instances on every render.
- In React, create instance inside event handler/effect, cleanup on unmount.
- Avoid starting tour during heavy page load; start after data and layout are stable.

## Comparative Analysis

| Need | Driver.js fit | Notes |
| --- | --- | --- |
| Simple onboarding tours | Strong | Small API, quick setup |
| One-off element highlight | Strong | `highlight()` is direct |
| Complex branching onboarding | Medium | Possible with hooks, but complexity grows |
| Full analytics/onboarding platform | Weak | Need custom analytics/state |
| React-specific abstractions | Medium | Framework-agnostic; wrapper hook recommended |

## Recommendations

### Getting Started In `examio-fe`

1. Install in frontend root:

```bash
cd examio-fe
yarn add driver.js
```

2. Add stable targets in components:

```tsx
<button data-tour="dashboard-upload">Upload tài liệu</button>
```

3. Create a small tour helper/hook:

```ts
import { driver, type Config, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const defaultTourConfig: Config = {
  animate: true,
  smoothScroll: true,
  showProgress: true,
  progressText: "{{current}}/{{total}}",
  nextBtnText: "Tiếp",
  prevBtnText: "Quay lại",
  doneBtnText: "Xong",
  popoverClass: "examio-tour-popover",
  stagePadding: 8,
  stageRadius: 12,
};

export function startTour(tourKey: string, steps: DriveStep[]) {
  const storageKey = `examio:tour:${tourKey}:done`;
  if (localStorage.getItem(storageKey) === "1") return;

  const existingTargets = steps.filter((step) => {
    if (typeof step.element !== "string") return true;
    return document.querySelector(step.element);
  });

  if (!existingTargets.length) return;

  const driverObj = driver({
    ...defaultTourConfig,
    steps: existingTargets,
    onDestroyed: () => localStorage.setItem(storageKey, "1"),
  });

  driverObj.drive();
  return driverObj;
}
```

4. Trigger manually or first-run after layout is ready:

```tsx
useEffect(() => {
  const tour = startTour("dashboard-v1", dashboardTourSteps);
  return () => tour?.destroy();
}, []);
```

### Example Tour Steps

```ts
export const dashboardTourSteps = [
  {
    element: "[data-tour='dashboard-upload']",
    popover: {
      title: "Upload tài liệu",
      description: "Tải tài liệu lên để tạo bộ học nhanh hơn.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='dashboard-ai-chat']",
    popover: {
      title: "AI chat",
      description: "Hỏi đáp dựa trên tài liệu và lịch sử học của bạn.",
      side: "left",
    },
  },
];
```

### Common Mistakes

- Using `.className` selectors that later change during UI refactor.
- Starting tour before API data/layout renders target nodes.
- Recreating driver object on every render.
- Forgetting CSS import, causing unstyled popovers.
- Overriding `onNextClick` without calling `moveNext()`.
- Making tours too long or blocking essential actions.
- Marking tour complete on close when product wants to show it again later. Decide close semantics first.

## Suggested Examio Integration Pattern

```text
src/lib/tour/
  tour-storage.ts       # localStorage helpers
  tour-runner.ts        # driver defaults + start/cleanup
  dashboard-tour.ts     # dashboard step definitions
  exam-room-tour.ts     # exam-room step definitions
```

Keep file sizes small. If only one tour is needed, start with one `tour-runner.ts` plus one step file; do not over-engineer.

## Sources & References

### Official Documentation

- Driver.js installation: https://driverjs.com/docs/installation
- Driver.js basic usage: https://driverjs.com/docs/basic-usage
- Driver.js configuration: https://driverjs.com/docs/configuration
- Driver.js API reference: https://driverjs.com/docs/api
- Driver.js theming: https://driverjs.com/docs/theming

### Package / Repository

- npm package: https://www.npmjs.com/package/driver.js
- GitHub repository: https://github.com/kamranahmedse/driver.js

## Next Steps

1. If you want onboarding in Examio, choose first target page: dashboard, exam room, or AI chat.
2. Add Driver.js dependency in `examio-fe`.
3. Implement a minimal `tour-runner` and one first-run tour.
4. Validate with `yarn build` and manual browser check.

## Unresolved Questions

- Which Examio screen needs the first tour?
- Should closing a tour mark it complete, or only pressing `Done`?
- Should tour completion stay local-only or sync to user profile later?
