import { cn } from "@/lib/utils";
import { useThemeContext } from "@/provider/ThemeProvider";

interface LogoProps {
  className?: string;
  sizeLogo?: number;
  sizeText?: number;
  showText?: boolean;
}

export default function Logo({
  className,
  sizeLogo = 40,
  sizeText,
  showText = true,
}: LogoProps) {
  const { isDarkMode } = useThemeContext();
  const logoSrc = isDarkMode ? "/examio-darkmode.png" : "/examio-lightmode.png";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src={logoSrc}
        alt="Examio"
        className="shrink-0 rounded-lg object-cover"
        style={{ height: sizeLogo, width: sizeLogo }}
      />
      {showText && (
        <span
          className="font-display font-semibold leading-none tracking-tight text-ink"
          style={{ fontSize: sizeText ?? 20 }}
        >
          Examio
        </span>
      )}
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
  const { isDarkMode } = useThemeContext();
  const logoSrc = isDarkMode ? "/examio-darkmode.png" : "/examio-lightmode.png";

  return (
    <div className={cn("flex items-center", className)}>
      <img
        src={logoSrc}
        alt="Examio"
        className="shrink-0 rounded-lg object-cover"
        style={{ height: sizeIcon, width: sizeIcon }}
      />
    </div>
  );
}
