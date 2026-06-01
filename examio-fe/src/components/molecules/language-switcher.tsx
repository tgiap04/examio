import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/antd/dropdown-menu";
import { cn } from "@/lib/utils";

const SUPPORTED_LANGUAGES = [
  { code: "vi", label: "Tiếng Việt", short: "VI" },
  { code: "en", label: "English", short: "EN" },
  { code: "ja", label: "日本語", short: "JA" },
];

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.resolvedLanguage ?? i18n.language ?? "vi";
  const languageCode = language.split("-")[0];
  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === languageCode) ??
    SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("nav.language")}
          className="inline-flex h-9 items-center gap-1.5 rounded-[9999px] border border-hairline bg-surface-card px-3 text-[12px] font-medium uppercase tracking-[1px] text-ink transition-colors hover:border-coral/40 hover:bg-surface-cream-strong"
        >
          <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
          {current.short}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {SUPPORTED_LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => i18n.changeLanguage(l.code)}
            className={cn(languageCode === l.code && "font-medium text-coral")}
          >
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
