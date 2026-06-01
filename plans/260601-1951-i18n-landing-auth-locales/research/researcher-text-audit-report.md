# Text Audit Report: Landing & Auth Pages (examio-fe)

**Scope:** examio-fe/src/pages/landing/, pages/auth/, routes/layouts/PublicLayout.tsx, routes/index.tsx, components/organisms/landing/, components/molecules/HeaderSection.tsx, components/organisms/FooterSection.tsx, components/organisms/auth/
**Date:** 2026-06-01
**Conclusion:** No i18n library is installed. All text is hardcoded Vietnamese.

---

## 1. Hardcoded Vietnamese Text by Section

### 1.1 PublicLayout / HeaderSection (`HeaderSection.tsx`)

| String | Category |
|---|---|
| Tính năng | nav link |
| Giới thiệu | nav link |
| Liên hệ | nav link |
| Công cụ | nav link (authed) |
| Đăng nhập | nav link + mobile menu |
| Bắt đầu | nav button |
| Chuyển sang sáng / Chuyển sang tối | aria-label (dynamic) |
| Ngôn ngữ | aria-label |
| Tài khoản | dropdown label |
| Hồ sơ | dropdown item |
| Đăng xuất | dropdown item |
| Mở menu / Đóng menu | aria-label (dynamic) |

### 1.2 PublicLayout / FooterSection (`FooterSection.tsx`)

| String | Category |
|---|---|
| Sản phẩm | footer group title |
| Tài nguyên | footer group title |
| Pháp lý | footer group title |
| Tính năng / Bảng giá / Phòng thi / AI Tool | footer links |
| Giới thiệu / Liên hệ / Hướng dẫn / Cộng đồng | footer links |
| Điều khoản / Quyền riêng tư / Cookie / Bảo mật | footer links |
| Nhận tin tức về AI học tập, mỗi tuần một bản. | footer heading |
| Mẹo ôn thi, tính năng mới và case study... | footer subtext |
| email@cua-ban.vn | newsletter placeholder |
| Đăng ký / Đã đăng ký | newsletter button (dynamic) |
| Hà Nội, Việt Nam | footer address |
| togiap.dev@gmail.com | contact email |
| Facebook / Twitter / Instagram / LinkedIn | social labels |
| © {year} Examio. Made with love by tgiap.dev | copyright |
| Điều khoản / Quyền riêng tư / Cookie | footer bottom links |
| 🇻🇳 Tiếng Việt | locale display |

### 1.3 HeroBand (`components/organisms/landing/HeroBand.tsx`)

| String | Category |
|---|---|
| AI cho việc học | badge |
| Biến mọi tài liệu thành kiến thức bạn nắm chắc. | h1 heading |
| Examio dùng AI để biến PDF... | body paragraph |
| Bắt đầu miễn phí | CTA button |
| Xem cách hoạt động | secondary CTA button |
| AI đang phân tích | mockup terminal label |
| Nhận diện 12 chương · 248 khái niệm | mockup line |
| Sinh 40 câu trắc nghiệm | mockup line |
| Tạo 120 flashcard theo chủ đề | mockup line |
| Câu hỏi mẫu | mockup label |
| Định lý nào phát biểu... | sample question |
| A. Định lý Rolle / B. Định lý Weierstrass / C. Định lý Lagrange / D. Định lý Bolzano | sample answers |

### 1.4 TrustStrip (`TrustStrip.tsx`)

| String | Category |
|---|---|
| Được tin dùng bởi | eyebrow |
| Sinh viên trên toàn quốc / Học viên ôn thi THPT / Giảng viên & gia sư | trust items |

### 1.5 FeatureGrid (`FeatureGrid.tsx`)

| String | Category |
|---|---|
| Tính năng cốt lõi | section eyebrow |
| Mọi thứ bạn cần để học từ tài liệu thật. | heading |
| Không tổng quát hoá... | body paragraph |
| Quiz & Flashcard tự động | feature title |
| Tải lên PDF, Word hoặc ảnh... | feature description |
| Thử tạo quiz | feature CTA |
| Phòng thi có giám sát | feature title |
| Mở phòng thi trực tuyến... | feature description |
| Tạo phòng thi | feature CTA |
| AI Tutor hiểu tài liệu | feature title |
| Đặt câu hỏi trực tiếp... | feature description |
| Trò chuyện với AI | feature CTA |

### 1.6 ProductShowcase (`ProductShowcase.tsx`)

| String | Category |
|---|---|
| Quy trình | eyebrow |
| Từ tệp tài liệu đến đề ôn tập, chỉ một lần upload. | heading |
| Không cần copy-paste... | body paragraph |
| Trích xuất nội dung từ PDF, Word, ảnh chụp | step |
| Phân loại theo chương, mục và độ khó | step |
| Sinh quiz và flashcard có trích dẫn nguồn | step |
| Đồng bộ vào phòng luyện thi của bạn | step |
| Thử ngay | CTA button |
| examio · pipeline | terminal title bar |
| # 1. Upload tài liệu / # 2. Sinh đề trắc nghiệm / # 3. Tạo flashcard | terminal comments |
| $ examio upload giai-tich-1.pdf | terminal cmd |
| ✓ Đã trích xuất 12 chương · 248 khái niệm | terminal output |
| $ examio quiz --count=40 --difficulty=mixed | terminal cmd |
| ✓ Sinh 40 câu hỏi (15 dễ · 18 trung bình · 7 khó) | terminal output |
| $ examio flashcards --per-chapter=10 | terminal cmd |
| ✓ 120 flashcard sẵn sàng | terminal output |

### 1.7 WaysToStudy (`WaysToStudy.tsx`)

| String | Category |
|---|---|
| Ba cách học | eyebrow |
| Bạn đang cần ôn theo cách nào? | heading |
| Examio không ép bạn theo một quy trình... | body paragraph |
| Tự ôn tập | card name |
| Học một mình | card tag |
| Tải lên tài liệu, AI tạo flashcard... | card blurb |
| Bắt đầu tự ôn | card CTA |
| Phòng luyện thi | card name |
| Mô phỏng kỳ thi | card tag |
| Tạo đề thi có thời gian, có giám sát... | card blurb |
| Vào phòng thi | card CTA |
| Hỏi đáp với AI | card name |
| Học có dẫn dắt | card tag |
| Nói chuyện trực tiếp với AI... | card blurb |
| Mở AI chat | card CTA |

### 1.8 PricingBand (`PricingBand.tsx`) + PricingCards (`PricingCards.tsx`)

**Static hardcoded:**
| String | Category |
|---|---|
| Bảng giá | eyebrow |
| Học nhiều hơn, trả ít hơn. | heading |
| Bắt đầu miễn phí... | body paragraph |
| Theo tháng | toggle button |
| Theo năm | toggle button |
| -20% | discount badge |
| Phổ biến | popular badge |
| Miễn phí | zero-price label |
| /tháng / /năm | billing period (interpolated) |
| Không thể tải bảng giá. Vui lòng thử lại sau. | error message |

**Dynamic (from API, interpolated — see section 3):**
- Tier name, description, CTA label — via `SubscriptionPlanResponse.nameVi`, `tierMeta[tier].description`, `tierMeta[tier].ctaLabel`
- Feature labels: `${creditsPerMonth} credits / tháng`, `file / tháng`, `tin nhắn / phút`, etc.

### 1.9 CoralCallout (`CoralCallout.tsx`)

| String | Category |
|---|---|
| Sẵn sàng học? | badge |
| Bắt đầu học cùng Examio hôm nay. | heading |
| Tải tài liệu đầu tiên... | body paragraph |
| Tạo tài khoản miễn phí | CTA button |
| Khám phá công cụ | secondary CTA |
| 2 phút để biến PDF thành đề ôn | stat label |
| 120+ flashcard mỗi tài liệu | stat label |
| Miễn phí cho người dùng mới | stat label |

### 1.10 LegalPageShell + Legal Pages (TermsPage, PrivacyPage, CookiesPage, SecurityPage)

**LegalPageShell** (template):
| String | Category |
|---|---|
| Cập nhật lần cuối: {lastUpdated} | last-updated label (interpolated) |

**TermsPage** (6 sections + header):
| String | Category |
|---|---|
| Điều khoản sử dụng | page title |
| 1. Giới thiệu / 2. Tài khoản người dùng / 3. Nội dung người dùng / 4. Sử dụng hợp lý / 5. Giới hạn trách nhiệm / 6. Thay đổi điều khoản | section headings |
| Full paragraphs for each section (6 long-form paragraphs) | body text |

**PrivacyPage** (6 sections + header):
| String | Category |
|---|---|
| Chính sách quyền riêng tư | page title |
| 1. Thông tin chúng tôi thu thập / 2. Cách chúng tôi sử dụng thông tin / 3. Lưu trữ và bảo mật / 4. Quyền của bạn / 5. Chia sẻ với bên thứ ba / 6. Liên hệ | section headings |
| Full paragraphs (6 long-form paragraphs) | body text |

**CookiesPage** (4 sections + header):
| String | Category |
|---|---|
| Chính sách Cookie | page title |
| 1. Cookie là gì? / 2. Cookie chúng tôi sử dụng / 3. Cookie bên thứ ba / 4. Quản lý cookie | section headings |
| Full paragraphs (4 paragraphs) | body text |

**SecurityPage** (5 sections + header):
| String | Category |
|---|---|
| Chính sách bảo mật | page title |
| 1. Mã hoá dữ liệu / 2. Xác thực và phiên / 3. Bảo vệ tài liệu / 4. AI và dữ liệu / 5. Báo cáo lỗ hổng | section headings |
| Full paragraphs (5 paragraphs) | body text |

### 1.11 AboutSection (`ContactSection` → wait, that's ContactSection — AboutSection is components/organisms/AboutSection.tsx)

**AboutSection:**
| String | Category |
|---|---|
| Về chúng tôi | eyebrow |
| Học tập nên dựa trên tài liệu thật... | h1 heading |
| Examio ra đời từ nhu cầu thực tế... | intro paragraph |
| 2+ Năm phát triển / 10K+ Bài kiểm tra được tạo / 98% Người dùng hài lòng | stats |
| Sứ mệnh | section eyebrow |
| Dân chủ hoá việc ôn tập chất lượng cao. | section heading |
| Không phải ai cũng có gia sư riêng... | body paragraph |
| Tầm nhìn | section eyebrow |
| Mỗi sinh viên đều có trợ lý học tập riêng. | section heading |
| Chúng tôi hướng tới tương lai... | body paragraph |
| Giá trị cốt lõi | eyebrow |
| Những gì chúng tôi tin. | heading |
| Tập trung vào người học | value title |
| Mọi tính năng đều xuất phát từ nhu cầu... | value description |
| Minh bạch với AI | value title |
| AI trích dẫn nguồn cụ thể... | value description |
| Học từ tài liệu thật | value title |
| Examio không tạo nội dung từ internet... | value description |
| Sẵn sàng thử Examio? | cta heading |
| Tải tài liệu đầu tiên... | cta body |
| Tạo tài khoản miễn phí | cta button |

**ContactSection:**
| String | Category |
|---|---|
| Liên hệ | eyebrow |
| Chúng tôi luôn sẵn sàng lắng nghe. | h1 heading |
| Có câu hỏi, góp ý hay muốn hợp tác... | intro paragraph |
| Gửi tin nhắn | form heading |
| Chúng tôi sẽ phản hồi trong vòng 24 giờ. | form subtext |
| Họ và tên | field label |
| Nguyễn Văn A | name placeholder |
| Email | field label |
| email@example.com | email placeholder |
| Số điện thoại (tuỳ chọn) | field label |
| 0912 345 678 | phone placeholder |
| Nội dung | field label |
| Bạn muốn nói gì với chúng tôi? | textarea placeholder |
| Gửi tin nhắn / Đã gửi | submit button (dynamic) |
| Email / Điện thoại / Địa chỉ | contact card titles |
| Hà Nội, Việt Nam | address value |
| Hợp tác | eyebrow |
| Bạn là giảng viên hoặc tổ chức giáo dục? | heading |
| Chúng tôi có chương trình hợp tác... | body |
| Tìm hiểu thêm | CTA link |

### 1.12 SigninForm (`components/organisms/auth/signin-form.tsx`)

| String | Category |
|---|---|
| Chào Mừng Trở Lại | h2 |
| Đăng nhập vào Examio | subheading |
| Tên Đăng Nhập hoặc Email | field label |
| Tên Đăng Nhập hoặc Email | placeholder |
| Mật Khẩu | field label |
| •••••••• | password placeholder |
| Quên mật khẩu? | link |
| Đăng Nhập | submit button |
| Hoặc tiếp tục với | divider |
| Google | OAuth button |
| Bạn chưa có tài khoản? / Đăng ký ngay | link text |

### 1.13 SignupForm (`components/organisms/auth/signup-form.tsx`)

| String | Category |
|---|---|
| Chào Mừng Đến Với Examio | h2 |
| Đăng Ký | h1 |
| Tên Đăng Nhập | label + placeholder |
| Email | label + placeholder |
| email@examio.vn | email placeholder |
| Mật Khẩu | label |
| •••••••• | password placeholder |
| Nhập Lại Mật Khẩu | label + placeholder |
| Đăng Ký → | submit button |
| Hoặc đăng ký với | divider |
| Google | OAuth button |
| Đã có tài khoản? / Đăng Nhập | link text |

**Also:** `signup-form.tsx` line 49 calls `toast.warning("Mật khẩu nhập lại không khớp!")` — hardcoded error message in store call.

### 1.14 ForgotPasswordPage (`pages/auth/ForgotPasswordPage.tsx`)

| String | Category |
|---|---|
| Quên mật khẩu? | h1 |
| Nhập email của bạn để nhận mã đặt lại mật khẩu | subtext |
| Email | label |
| email@example.com | placeholder |
| Gửi mã đặt lại | submit button |
| Đang gửi... | loading text |
| Mã đặt lại đã được gửi! | success message |
| Đang chuyển hướng... | redirect message |
| Quay lại đăng nhập | back link |

### 1.15 ResetPasswordPage (`pages/auth/ResetPasswordPage.tsx`)

| String | Category |
|---|---|
| Đặt lại mật khẩu | h1 |
| Nhập mã xác nhận và mật khẩu mới | subtext |
| Email | label |
| email@example.com | placeholder |
| Mã xác nhận | label |
| Mật khẩu mới | label |
| Nhập mật khẩu mới | placeholder |
| Xác nhận mật khẩu | label |
| Nhập lại mật khẩu mới | placeholder |
| Mật khẩu không khớp | error message |
| Đặt lại mật khẩu | submit button |
| Đang xử lý... | loading text |
| Đặt lại mật khẩu thành công! | success h2 |
| Đang chuyển hướng đến trang đăng nhập... | success message |
| Quay lại đăng nhập | back link |

### 1.16 NotFoundPage (`routes/index.tsx`)

| String | Category |
|---|---|
| 404 | heading |
| Không tìm thấy trang. | body text |

### 1.17 LoginPage (`pages/auth/LoginPage.tsx`)

| String | Category |
|---|---|
| Đang tải... | suspense fallback |

---

## 2. Unique String Count Estimate

| Category | Count (approx) |
|---|---|
| Nav links / menu items | ~8 |
| Footer (links, headings, address, socials) | ~30 |
| HeroBand (heading, body, CTAs, mockup) | ~15 |
| TrustStrip | ~4 |
| FeatureGrid (3 cards x 3 strings) | ~9 |
| ProductShowcase (steps, CTA, terminal) | ~15 |
| WaysToStudy (3 cards x 4 strings) | ~12 |
| PricingBand + PricingCards (static + dynamic) | ~12 static |
| CoralCallout (heading, body, CTAs, stats) | ~8 |
| Legal pages (4 pages x 5–7 sections + headings + long paragraphs) | ~50 |
| AboutSection | ~20 |
| ContactSection (form, cards, cta) | ~20 |
| SigninForm | ~10 |
| SignupForm | ~12 |
| ForgotPasswordPage | ~8 |
| ResetPasswordPage | ~12 |
| NotFoundPage + LoginPage | ~3 |
| **Total unique strings** | **~250** |

**After deduplication of repeated nav/footer/label strings: ~180–200 unique translatable strings.**

---

## 3. Dynamic / Interpolated Strings Needing Special Handling

### 3.1 PricingBand — from API response + hardcoded tierMeta

```ts
// tierMeta[tier].description  → fetched from API or hardcoded in PricingBand.tsx
// tierMeta[tier].ctaLabel    → hardcoded Vietnamese in PricingBand.tsx
// buildTier features array   → built at runtime with plan data:
`${plan.creditsPerMonth} credits / tháng`
formatLimit(plan.filesPerMonth, "file / tháng", "Upload không giới hạn")
formatLimit(plan.messagesPerMinute, "tin nhắn / phút", "Không giới hạn tin nhắn")
`${plan.chatMessagesLimit} tin nhắn AI / ngày`
```

**Risk:** These are built at runtime from API data + hardcoded Vietnamese strings mixed together. Recommended: either (a) add `nameVi`, `descriptionVi`, `ctaLabelVi`, `featureLabelsVi[]` to the API response and remove `tierMeta` entirely, or (b) keep `tierMeta` but move it to a separate locale object.

### 3.2 LegalPageShell — lastUpdated label

```
"Cập nhật lần cuối: {lastUpdated}"
```

The `{lastUpdated}` value itself is hardcoded Vietnamese date string in each page. If API-backed, move to API.

### 3.3 CoralCallout stats — static array

```ts
{ value: "2 phút", label: "để biến PDF thành đề ôn" }
{ value: "120+", label: "flashcard mỗi tài liệu" }
{ value: "Miễn phí", label: "cho người dùng mới" }
```

### 3.4 ProductShowcase — static steps array

```ts
"Trích xuất nội dung từ PDF, Word, ảnh chụp"
"Phân loại theo chương, mục và độ khó"
"Sinh quiz và flashcard có trích dẫn nguồn"
"Đồng bộ vào phòng luyện thi của bạn"
```

### 3.5 SigninForm — error toast from store

```ts
// signup-form.tsx line 49
toast.warning("Mật khẩu nhập lại không khớp!")
```

This is a client-side validation error that lives in the UI layer but currently calls a hardcoded string. Should be moved to a locale file or at minimum a shared constants module.

---

## 4. Priority Recommendation

**Tier 1 — High Impact, Low Effort (extract to locale files):**
- All nav links (HeaderSection, FooterSection)
- All CTA buttons and form labels across SigninForm, SignupForm, ForgotPasswordPage, ResetPasswordPage
- Error messages and success states
- aria-labels, placeholders, loading text

**Tier 2 — Medium Effort (affects API or data models):**
- PricingBand `tierMeta` — move CTA/descriptions to API response
- PricingCard feature labels — add to API response
- Legal page content — consider API-backed CMS or at minimum extract to separate locale files

**Tier 3 — Nice to have:**
- HeroBand mockup terminal content (cosmetic, contextually in-Vietnamese)
- AboutSection long-form body paragraphs (editorial content — consider CMS)

---

## 5. Unresolved Questions

1. **i18n library choice?** No library currently installed. Recommend `react-i18next` as the de-facto standard for React. Alternative: `lingui` for compile-time extraction, or `@formatjs/intl` for lighter weight.
2. **Locale storage strategy?** HeaderSection already stores `examio.locale` in localStorage — does this imply a partial i18n strategy already in progress? Confirm before overwriting.
3. **Pricing API contract change?** Moving pricing tier text to the API requires a backend change. Should this be done in parallel with frontend i18n, or handled separately?
4. **Backend-sourced strings?** Legal page content, About page content — should these be CMS-backed (API-fetched with locale param) rather than hardcoded in frontend?
5. **RTL / number formatting?** Vietnamese uses `.` as thousand separator and `,` as decimal. If pricing cards use `NumberFlow` with locale-aware currency formatting, ensure it targets `vi-VN`.
