"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { env } from "@/lib/env";

interface TurnstileProviderProps {
  children: React.ReactNode;
}

export function TurnstileProvider({ children }: TurnstileProviderProps) {
  const siteKey = env.turnstileSiteKey;

  if (!siteKey) {
    return <>{children}</>;
  }

  return (
    <>
      <Turnstile
        siteKey={siteKey}
        options={{ action: "exam_session", appearance: "always" }}
        scriptOptions={{ appendTo: "head" }}
      />
      {children}
    </>
  );
}
