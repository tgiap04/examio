import { cn } from "@/lib/utils";
import { useThemeContext } from "@/provider/ThemeProvider";

interface LogoProps {
  className?: string;
  sizeLogo?: number;
  sizeText?: number;
  showText?: boolean;
}

// The icon reads as the dominant element in the lockup, so render it a bit
// larger than the passed size (keeps callers' relative sizing intact).
const ICON_SCALE = 1.25;

/** Theme-aware logo source: dark-background mark for dark mode, cream for light. */
function useLogoSrc() {
  const { isDarkMode } = useThemeContext();
  return isDarkMode ? "/logo_dark.png" : "/logo_light.png";
}

/**
 * The "KMAEdu" wordmark: "KMA" in coral, "Edu" in the foreground ink token —
 * which resolves to cream in dark mode (matching the brand lockup) and to dark
 * ink in light mode so it stays legible on the cream canvas.
 */
function Wordmark({ fontSize }: { fontSize: number }) {
  return (
    <span
      className="leading-none tracking-tight text-ink"
      style={{
        fontSize,
        fontFamily: '"Fredoka", var(--font-display)',
        fontWeight: 600,
      }}
    >
      <span className="text-coral">KMA</span>Edu
    </span>
  );
}

export default function Logo({
  className,
  sizeLogo = 40,
  sizeText,
  showText = true,
}: LogoProps) {
  const logoSrc = useLogoSrc();
  const iconSize = Math.round(sizeLogo * ICON_SCALE);

  return (
    <div className={cn("flex items-center gap-2.5 cursor-pointer", className)}>
      <img src={logoSrc} alt="KMAEdu Logo" width={iconSize} height={iconSize} />
      {showText && <Wordmark fontSize={sizeText ?? 20} />}
    </div>
  );
}

export function LogoOnly({
  className,
  sizeIcon,
}: {
  className?: string;
  sizeIcon: number;
}) {
  const logoSrc = useLogoSrc();
  const iconSize = Math.round(sizeIcon * ICON_SCALE);

  return (
    <div className={cn("flex items-center cursor-pointer", className)}>
      <img src={logoSrc} alt="KMAEdu Logo" width={iconSize} height={iconSize} className={className} />
    </div>
  );
}
