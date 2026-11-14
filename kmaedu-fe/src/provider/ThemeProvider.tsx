"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/** The app is light-only: AppProviders forces `light`, which also clears a stored "dark" preference. */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
