import { FileText, X } from "lucide-react";
import { Button } from "@/components/antd/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/antd/item";

interface ItemFileDetailProps {
  fileName: string;
  fileSize: number;
  onRemove: () => void;
  disabled?: boolean;
}

export function ItemFileDetail({
  fileName,
  fileSize,
  onRemove,
  disabled,
}: ItemFileDetailProps) {
  const formatBytes = (bytes: number, decimals = 2): string => {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
  };

  return (
    <Item variant="outline" className="w-full">
      <ItemMedia>
        <FileText className="size-5 text-primary" />
      </ItemMedia>
      <ItemContent className="flex items-start justify-between">
        <ItemTitle className="text-sm font-medium line-clamp-2 break-words">
          {fileName}
        </ItemTitle>
        <ItemDescription className="text-xs">
          {formatBytes(fileSize)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed">
          <X className="size-4" />
        </Button>
      </ItemActions>
    </Item>
  );
}
