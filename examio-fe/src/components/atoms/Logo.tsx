import { cn } from "@/lib/utils";

function ExamioIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      width={size}
      height={size}
      className={cn("shrink-0 text-ink", className)}
    >
      {/* Outer ring */}
      <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="3.5" />

      {/* Middle dashed ring — trống đồng pattern */}
      <circle cx="50" cy="50" r="36" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />

      {/* Inner ring */}
      <circle cx="50" cy="50" r="26" stroke="currentColor" strokeWidth="2" />

      {/* Center dot */}
      <circle cx="50" cy="50" r="10" fill="currentColor" />

      {/* 8 radiating spokes */}
      <line x1="50" y1="24" x2="50" y2="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="50" y1="76" x2="50" y2="86" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="24" y1="50" x2="14" y2="50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="76" y1="50" x2="86" y2="50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="32.3" y1="32.3" x2="25.6" y2="25.6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="67.7" y1="67.7" x2="74.4" y2="74.4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="67.7" y1="32.3" x2="74.4" y2="25.6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="32.3" y1="67.7" x2="25.6" y2="74.4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

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
  return (
    <div className={cn("flex items-center gap-3 cursor-pointer", className)}>
      <ExamioIcon size={sizeLogo} />
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
  return (
    <div className={cn("flex items-center cursor-pointer", className)}>
      <ExamioIcon size={sizeIcon} className={className} />
    </div>
  );
}
