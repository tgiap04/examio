import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  sizeLogo?: number;
  sizeText?: number;
  showText?: boolean;
}

function BrandMark({ size }: { size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg border border-hairline bg-canvas text-ink"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={Math.max(16, size - 10)} height={Math.max(16, size - 10)} viewBox="0 0 24 24" fill="none">
        <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function Logo({
  className,
  sizeLogo = 40,
  sizeText,
  showText = true,
}: LogoProps) {
  return (
    <div className={cn("flex items-center space-x-3", className)}>
      <BrandMark size={sizeLogo} />
      {showText && (
        <span className="font-bold whitespace-pre text-foreground">
          <p
            className={cn(
              sizeText ? `text-[${sizeText}px]` : "text-xl",
              "font-display font-semibold tracking-tight text-ink",
            )}
          >
            Examio
          </p>
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
  return (
    <div className={cn("flex items-center", className)}>
      <BrandMark size={sizeIcon} />
    </div>
  );
}
