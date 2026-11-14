import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  sizeLogo?: number;
  sizeText?: number;
  showText?: boolean;
}

// The seal reads as the dominant element in the lockup, so render it a bit
// larger than the passed size (keeps callers' relative sizing intact).
const ICON_SCALE = 1.2;

/** The KMA seal (Học viện Kỹ thuật Mật mã); transparent PNG, light theme only. */
const LOGO_SRC = "/logo.png";

/** The "KMAEdu" wordmark: "KMA" in the brand red of the seal, "Edu" in ink. */
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
      <span className="text-brand">KMA</span>Edu
    </span>
  );
}

export default function Logo({
  className,
  sizeLogo = 40,
  sizeText,
  showText = true,
}: LogoProps) {
  const iconSize = Math.round(sizeLogo * ICON_SCALE);

  return (
    <div className={cn("flex items-center gap-2.5 cursor-pointer", className)}>
      <img src={LOGO_SRC} alt="KMAEdu Logo" width={iconSize} height={iconSize} />
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
  const iconSize = Math.round(sizeIcon * ICON_SCALE);

  return (
    <div className={cn("flex items-center cursor-pointer", className)}>
      <img src={LOGO_SRC} alt="KMAEdu Logo" width={iconSize} height={iconSize} className={className} />
    </div>
  );
}
