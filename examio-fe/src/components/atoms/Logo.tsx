import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  sizeLogo?: number;
  sizeText?: number;
  showText?: boolean;
}

function BrandMark({ size }: { size: number }) {
  const innerSize = Math.max(18, size - 10);

  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl border border-coral/25 bg-[linear-gradient(135deg,#fff7ed_0%,#ffe7d6_48%,#f7c8b3_100%)] text-coral shadow-[0_8px_22px_rgba(204,120,92,0.20)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={innerSize} height={innerSize} viewBox="0 0 32 32" fill="none">
        <path
          d="M7.5 8.5C7.5 7.4 8.4 6.5 9.5 6.5H23.5C24.05 6.5 24.5 6.95 24.5 7.5V22.5C24.5 23.05 24.05 23.5 23.5 23.5H10.5C8.84 23.5 7.5 22.16 7.5 20.5V8.5Z"
          fill="currentColor"
          fillOpacity="0.12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M11 11.5H21M11 16H19"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M24.5 22.5H10.5C9.4 22.5 8.5 21.6 8.5 20.5C8.5 19.4 9.4 18.5 10.5 18.5H24.5V22.5Z"
          fill="white"
          fillOpacity="0.72"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M21.5 5.5L23.2 8.8L26.5 10.5L23.2 12.2L21.5 15.5L19.8 12.2L16.5 10.5L19.8 8.8L21.5 5.5Z"
          fill="#5DB8A6"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
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
        <span className="whitespace-pre text-foreground">
          <p
            className="font-display font-semibold leading-none tracking-tight text-ink"
            style={{ fontSize: sizeText ?? 20 }}
          >
            Examio
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Learn Lab
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
