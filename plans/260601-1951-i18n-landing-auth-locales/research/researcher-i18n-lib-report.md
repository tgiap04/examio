# Study Report: i18n Library Selection for React 19 + Vite

**Date:** 2026-06-01
**Context:** examio-fe — landing + auth pages, 3 languages (vi/en/ja)

---

## Summary

`react-i18next` is the recommended choice. It is the industry standard for React i18n, has first-class Vite + TypeScript support, a mature ecosystem, and handles the exact scope of this project (3 languages, SPA, no SSR) with minimal overhead. Lingui is the second choice if bundle size is the top constraint and the team is comfortable with its macro-based workflow.

---

## Libraries Compared

### 1. react-i18next + i18next

**Pros:**
- Industry standard — most adopted, largest community, most Stack Overflow / blog coverage
- Official Vite guide + `@vitejs/plugin-react` integration
- `Trans` component: translate rich React markup (Ant Design components inside translation strings)
- `useTranslation` hook + `I18nextProvider` for app-wide and scoped i18n
- TypeScript first-class — generates `*.d.ts` types from translation JSON via CLI
- Lazy-load translation JSON per namespace; only loads active language
- Works with React 19 (peer dep covers React 18/19)
- Language detection plugin (`i18next-browser-languagedetector`) optional but available
- JSON translation files — familiar, git-merge-friendly

**Cons:**
- Runtime i18n — translation strings shipped as JSON payloads (~5-15kb per language gzipped depending on content volume)
- Slightly larger total bundle than compile-time alternatives
- Two layers to learn: i18next core + react-i18next React bindings
- Manual string key management (no macro enforcement like Lingui)

**Bundle estimate (gzipped):** i18next core ~12kb + react-i18next ~5kb + 1 language JSON ~2-5kb (landing+auth scope)

---

### 2. Lingui (`@lingui/react` + `@lingui/core`)

**Pros:**
- Compile-time extraction — no translation strings in production bundle (only compiled ICU message catalogs)
- Macros (`<Trans>`, `t`...) enforce no raw strings in source
- Smaller runtime than react-i18next for large apps
- Standard PO file format — works with Crowdin, Lokalise, and AI translation tools
- `@lingui/vite-plugin` compiles catalogs on-the-fly in dev; production build bakes them in

**Cons:**
- Experimental SWC support; Babel path required for stability with `@vitejs/plugin-react-swc`
- React Compiler conflict: Lingui macro transform must run before React Compiler — ordering is not controllable in some Next.js SWC setups (not an issue for pure Vite SPA, but a known risk)
- Steeper learning curve: macro authoring, catalog compilation, ICU message format
- Fewer React-specific examples than react-i18next for simple SPA use cases
- JSON formatter exists but PO is the native format; JSON support feels secondary

**Bundle estimate:** `@lingui/core` + `@lingui/react` runtime ~8-10kb gzipped; zero translation string overhead in bundle if catalogs are loaded externally

---

### 3. `@formatjs/intl` / `react-intl`

**Pros:**
- Built on native `Intl` API — minimal extra code
- Good for number/date/currency formatting; less so for full app i18n
- Smaller bundle than i18next

**Cons:**
- React integration (`react-intl`) is less ergonomic than react-i18next for full-page translations
- No `Trans`-equivalent for rich nested markup (must use `FormattedMessage` with `values`)
- No official Vite guide; ecosystem tooling weaker
- JSON structured messages not native; requires custom parsing
- Not recommended for full-page app i18n with 3 languages

---

### 4. Others (paraglide, next-intl)

- **paraglide**: Kotlin/JS compile-time i18n — overkill for this scope
- **next-intl**: Built for Next.js with App Router RSC support — not applicable (Vite SPA)
- **react-wui**: Niche, insufficient community

---

## Recommendation: react-i18next + i18next

**Primary choice for the current project context.**

Rationale:
1. Landing + auth pages = modest translation volume (~200-400 keys) → runtime JSON overhead is negligible
2. Ant Design components inside translation strings are common in auth/landing UIs → `Trans` component is essential
3. TypeScript strict mode → first-class TS support with generated type definitions
4. React Router v7 SPA → no SSR concerns that would favor compile-time extraction
5. Team already uses `next-themes` (same pattern as i18n language switcher) → familiar UX pattern
6. Yarn 4 workspace → `i18next` and `react-i18next` install cleanly in any sub-package

**If bundle size becomes critical after profiling**, migrate to Lingui.

---

## Vite + React 19 Setup

```bash
cd examio-fe
yarn add i18next react-i18next i18next-browser-languagedetector i18next-http-backend
yarn add -D @types/i18next
```

```ts
// src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(HttpBackend)          // lazy-load /locales/{lang}/{ns}.json
  .use(LanguageDetector)    // detect from browser preference
  .use(initReactI18next)     // React bridge
  .init({
    fallbackLng: 'en',
    supportedLngs: ['vi', 'en', 'ja'],
    defaultNS: 'common',
    ns: ['common', 'landing', 'auth'],
    backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
    interpolation: { escapeValue: false },
  });

export default i18n;
```

```tsx
// src/provider/AppProviders.tsx — add i18n to provider chain
import './lib/i18n'; // side-effect import, runs once
```

---

## Translation File Structure

```
examio-fe/public/locales/
├── vi/
│   ├── common.json   # shared keys: buttons, labels, errors, nav
│   ├── landing.json  # landing page strings
│   └── auth.json     # sign in/up, forgot password, verify email
├── en/
│   ├── common.json
│   ├── landing.json
│   └── auth.json
└── ja/
    ├── common.json
    ├── landing.json
    └── auth.json
```

**common.json** (shared across all routes):
```json
{
  "nav": {
    "home": "Trang chủ",
    "features": "Tính năng",
    "pricing": "Bảng giá",
    "login": "Đăng nhập",
    "register": "Đăng ký"
  },
  "btn": {
    "submit": "Gửi",
    "cancel": "Hủy",
    "continue": "Tiếp tục"
  },
  "errors": {
    "required": "Trường này bắt buộc",
    "invalidEmail": "Email không hợp lệ",
    "serverError": "Đã xảy ra lỗi, vui lòng thử lại"
  },
  "lang": {
    "switch": "Đổi ngôn ngữ"
  }
}
```

**auth.json** (AuthLayout routes):
```json
{
  "signIn": {
    "title": "Chào mừng trở lại",
    "subtitle": "Đăng nhập để tiếp tục",
    "email": "Địa chỉ email",
    "password": "Mật khẩu",
    "rememberMe": "Ghi nhớ đăng nhập",
    "forgotPassword": "Quên mật khẩu?",
    "submit": "Đăng nhập",
    "noAccount": "Chưa có tài khoản?",
    "signUpLink": "Đăng ký ngay",
    "orContinueWith": "Hoặc tiếp tục với"
  },
  "signUp": {
    "title": "Tạo tài khoản",
    "subtitle": "Bắt đầu học tập miễn phí",
    "name": "Họ và tên",
    "email": "Địa chỉ email",
    "password": "Mật khẩu",
    "confirmPassword": "Xác nhận mật khẩu",
    "termsAgree": "Tôi đồng ý với <1>Điều khoản dịch vụ</1> và <2>Chính sách bảo mật</2>",
    "submit": "Tạo tài khoản",
    "hasAccount": "Đã có tài khoản?",
    "signInLink": "Đăng nhập"
  },
  "forgotPassword": {
    "title": "Quên mật khẩu",
    "subtitle": "Nhập email để nhận liên kết đặt lại mật khẩu",
    "email": "Địa chỉ email",
    "submit": "Gửi liên kết đặt lại",
    "backToLogin": " Quay lại đăng nhập"
  },
  "verifyEmail": {
    "title": "Xác minh email",
    "subtitle": "Chúng tôi đã gửi mã xác minh đến {{email}}",
    "enterCode": "Nhập mã xác minh",
    "submit": "Xác minh",
    "resendCode": "Gửi lại mã",
    "resendSuccess": "Mã mới đã được gửi"
  }
}
```

**landing.json** (PublicLayout routes):
```json
{
  "hero": {
    "headline": "Học tập thông minh hơn với Examio",
    "subheadline": "Nền tảng thi trực tuyến và học tập thông minh, hỗ trợ AI",
    "cta": "Bắt đầu miễn phí",
    "ctaSecondary": "Tìm hiểu thêm"
  },
  "features": {
    "title": "Tính năng nổi bật",
    "ai": {
      "title": "Hỗ trợ AI thông minh",
      "desc": "Trợ lý AI giúp bạn học hiệu quả hơn"
    }
  }
}
```

---

## Language Switcher UX Pattern

```tsx
// src/components/LanguageSwitcher.tsx
import { useTranslation } from 'react-i18next';
import { Select } from 'antd';
import { useTheme } from 'next-themes';

const LANGUAGES = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <Select
      value={i18n.language}
      onChange={(lang) => i18n.changeLanguage(lang)}
      options={LANGUAGES}
      variant="borderless"
      popupMatchSelectWidth={false}
    />
  );
}
```

---

## Sources

- [react-i18next documentation](https://react.i18next.com/)
- [i18next documentation](https://www.i18next.com/)
- [Lingui setup with Vite](https://lingui.dev/tutorials/setup-vite)
- [i18next migration guide](https://www.i18next.com/misc/migration-guide)
