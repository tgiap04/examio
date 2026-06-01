"use client";
import { useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { ShieldCheck } from "lucide-react";
import { env } from "@/lib/env";

interface TurnstileGuardProps {
  onTokenReady: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

/**
 * TurnstileGuard — renders Cloudflare Turnstile widget inline.
 * Calls onTokenReady when verification succeeds.
 * Used on: login, signup, flashcard study pages.
 * NOT used globally — only on pages that need bot protection.
 */
export function TurnstileGuard({ onTokenReady, onExpire, onError }: TurnstileGuardProps) {
  const turnstileRef = useRef<TurnstileInstance>(null);
  const siteKey = env.turnstileSiteKey;

  if (!siteKey) return null;

  return (
    <Turnstile
      ref={turnstileRef}
      siteKey={siteKey}
      options={{ action: "page_guard", appearance: "always" }}
      onSuccess={onTokenReady}
      onExpire={onExpire}
      onError={onError}
    />
  );
}
