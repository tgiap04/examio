# Research Report: Google One Tap Implementation (React 19 + NestJS)

**Date:** 2026-05-21  
**Context:** examio project already uses `passport-google-oauth20` for redirect-based OAuth. One Tap adds a non-redirect credential flow.

---

## Summary

Google One Tap uses the Google Identity Services (GIS) library to display a prompt overlay. User taps → Google returns a JWT credential directly to a JS callback → frontend sends JWT to backend → backend verifies with `google-auth-library` → extracts user info. No redirect flow needed.

The existing `authService.googleLogin(user)` can be reused — One Tap just provides a different entry point to the same user object shape.

---

## 1. Loading the GIS Script in React

```tsx
// hooks/useGoogleOneTap.ts
import { useEffect, useRef } from "react"

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client"

export function useGoogleOneTap(onCredential: (credential: string) => void) {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const script = document.createElement("script")
    script.src = GIS_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: (response: google.CredentialResponse) => {
          onCredential(response.credential)
        },
        auto_select: true,
        cancel_on_tap_outside: true,
        itp_support: true,
      })
      window.google.accounts.id.prompt((notification) => {
        if (notification.isSkippedMoment()) {
          console.log("One Tap skipped:", notification.getSkippedReason())
        }
      })
    }
    document.head.appendChild(script)

    return () => {
      window.google?.accounts.id.cancel()
    }
  }, [onCredential])
}
```

**TypeScript types** — add to `src/types/google.d.ts`:
```ts
declare namespace google.accounts.id {
  function initialize(config: IdConfiguration): void
  function prompt(listener?: (notification: PromptMomentNotification) => void): void
  function cancel(): void
  function disableAutoSelect(): void
  function renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void
}
```

Or install `@types/google.accounts` if available — but the official types are thin, a local `.d.ts` is more reliable.

---

## 2. Initialize Parameters (IdConfiguration)

| Parameter | Value | Why |
|-----------|-------|-----|
| `client_id` | Your OAuth 2.0 Web Client ID | Required |
| `callback` | `(response) => void` | Receives JWT on success |
| `auto_select` | `true` | Auto-signs in returning users (single session, previously approved) |
| `cancel_on_tap_outside` | `true` (default) | Closes prompt on outside click |
| `itp_support` | `true` | Upgraded UX for Safari/ITP browsers |
| `nonce` | Optional random string | Replay protection — verify on backend |
| `context` | `"signin"` | Prompt wording |

**Important:** `initialize()` must be called only once. Use a ref guard in React.

---

## 3. Credential (JWT) Return Flow

```
User taps → Google validates session → callback fires with CredentialResponse
```

**CredentialResponse shape:**
```ts
{
  credential: string    // Base64-encoded JWT ID token
  select_by: string     // "auto" | "user" | "user_1tap" | "user_2tap" | "btn" | ...
  state?: string        // Only if configured on button
}
```

**Decoded JWT payload contains:**
- `sub` — stable Google Account ID (use as primary identifier, NOT email)
- `email`, `email_verified`
- `name`, `given_name`, `family_name`, `picture`
- `iss` — `accounts.google.com` or `https://accounts.google.com`
- `aud` — your client ID
- `exp`, `iat`

Frontend sends `response.credential` (the raw JWT string) to backend via POST.

---

## 4. Backend Verification (NestJS)

**Install:**
```bash
yarn add google-auth-library
```

**Service implementation:**
```ts
// auth-service/src/google-one-tap.service.ts
import { Injectable, UnauthorizedException } from "@nestjs/common"
import { OAuth2Client } from "google-auth-library"

@Injectable()
export class GoogleOneTapService {
  private client = new OAuth2Client()

  async verifyIdToken(idToken: string) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      const payload = ticket.getPayload()
      if (!payload) throw new UnauthorizedException("Invalid token payload")

      return {
        googleId: payload.sub,           // Primary identifier
        email: payload.email,
        emailVerified: payload.email_verified,
        firstName: payload.given_name,
        lastName: payload.family_name,
        picture: payload.picture,
      }
    } catch (error) {
      throw new UnauthorizedException("Google ID token verification failed")
    }
  }
}
```

**What `verifyIdToken()` checks automatically:**
- JWT signature (fetches Google's public keys and caches them)
- `aud` matches your client ID
- `iss` is `accounts.google.com` or `https://accounts.google.com`
- `exp` not expired

**Controller endpoint:**
```ts
@Post('google/one-tap')
async googleOneTap(@Body('credential') credential: string) {
  const googleUser = await this.googleOneTapService.verifyIdToken(credential)
  // Reuse existing googleLogin logic:
  return this.authService.googleLogin({
    email: googleUser.email,
    firstName: googleUser.firstName,
    lastName: googleUser.lastName,
    picture: googleUser.picture,
    accessToken: null, // One Tap doesn't provide OAuth access token
  })
}
```

**Architectural fit:** The existing `authService.googleLogin()` already handles find-or-create user logic. One Tap just provides a different credential acquisition path — the downstream logic is identical.

---

## 5. Best Practices

### auto_select
- Set `true` for returning users — skips the tap, auto-signs in
- Only works when: single Google session + user previously consented + no `disableAutoSelect()` cookie
- Call `google.accounts.id.disableAutoSelect()` on logout to prevent sign-in loops

### cancel_on_tap_outside
- Default `true` — prompt closes on outside click
- Set `false` only for critical auth flows where you want the prompt persistent

### Cooldown After Dismiss
Google enforces an **exponential cooldown** when users dismiss One Tap:

| Dismissals | Cooldown |
|------------|----------|
| 1 | 2 hours |
| 2 | 1 day |
| 3 | 1 week |
| 4+ | 4 weeks |

- Cooldown stored in browser cookie on `.google.com` — cannot be bypassed
- `suppressed_by_user` in `getNotDisplayedReason()` indicates active cooldown
- Do NOT call `prompt()` on every page — only on login/signup pages
- Provide a fallback Google Sign-In button for users in cooldown

### Additional Recommendations
- **Nonce:** Generate server-side, pass to `initialize()`, verify in JWT payload on backend
- **CSRF:** One Tap uses SameSite cookies internally; your POST endpoint should still validate origin
- **FedCM:** `use_fedcm_for_prompt` is deprecated — Google is migrating to FedCM automatically on Chrome 117+. No action needed.
- **Fallback:** Always render a standard Google Sign-In button alongside One Tap for users where prompt doesn't display

---

## 6. Integration with Existing examio Auth

Current state:
- `passport-google-oauth20` handles redirect-based OAuth via `GoogleStrategy`
- `authService.googleLogin(user)` is the shared handler

Recommended approach:
1. Add `google-auth-library` dependency
2. Create `GoogleOneTapService` for token verification
3. Add `POST /auth/google/one-tap` endpoint in auth controller
4. Reuse `authService.googleLogin()` — same user shape
5. Frontend: add `useGoogleOneTap` hook, call on login page
6. Frontend: POST credential to new endpoint, handle session same as redirect flow

No changes needed to existing Passport strategy — both flows coexist.

---

## Sources

- [Google Identity Services JS Reference](https://developers.google.com/identity/gsi/web/reference/js-reference)
- [Google ID Token Verification Guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Display One Tap Guide](https://developers.google.com/identity/gsi/web/guides/display-button)
- [google-auth-library npm](https://www.npmjs.com/package/google-auth-library)

---

## Unresolved Questions

1. **Nonce implementation** — does the current auth flow already generate a nonce/CSRF token that could be reused for One Tap, or should a new one be generated per page load?
2. **Device ID tracking** — the frontend Axios interceptor attaches `X-Device-ID`; should the One Tap endpoint also register a device session?
3. **FedCM migration** — Chrome 117+ uses FedCM by default for One Tap; need to verify the prompt still renders correctly in the examio allowed origins configuration.
