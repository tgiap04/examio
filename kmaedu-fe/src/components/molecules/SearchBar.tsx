import { Search } from "lucide-react";
import { Input } from "@/components/antd/input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
}: SearchBarProps) {
  return (
    <div className="relative flex-1 max-w-md min-w-xs">
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10 bg-background border-border !py-2"
        prefix={<Search className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
