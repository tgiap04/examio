import { useToast } from "@/components/antd/toast";
import { validatePdfPageCount } from "@/lib/pdfUtils";

export const PDF_MAX_BYTES = 5 * 1024 * 1024;

/** File picking, removal and pre-generate checks shared by the quiz and flashcard generators. */
export function usePdfFileHandlers({
  file,
  setFile,
  clear,
}: {
  file: File | null | undefined;
  setFile: (file: File) => void;
  clear: () => void;
}) {
  const { toast } = useToast();

  const tooManyPages = (pageCount: number) =>
    toast({
      title: "File PDF quá lớn",
      description: `File có ${pageCount} trang. Giới hạn tối đa là 50 trang.`,
      variant: "destructive",
    });

  const pickFile = async (picked: File) => {
    const isPdf = picked.type === "application/pdf" || picked.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast({ title: "Lỗi tải file", description: "Chỉ hỗ trợ file PDF.", variant: "destructive" });
      return;
    }
    if (picked.size > PDF_MAX_BYTES) {
      toast({ title: "Lỗi tải file", description: "File vượt quá 5 MB.", variant: "destructive" });
      return;
    }
    try {
      const { valid, pageCount } = await validatePdfPageCount(picked);
      if (!valid) {
        tooManyPages(pageCount);
        return;
      }
    } catch (error) {
      toast({
        title: "Lỗi đọc file PDF",
        description: error instanceof Error ? error.message : "Không thể đọc file PDF",
        variant: "destructive",
      });
      return;
    }
    setFile(picked);
    toast({
      title: "File đã được tải lên",
      description: `${picked.name} (${(picked.size / 1024 / 1024).toFixed(2)} MB)`,
    });
  };

  const removeFile = () => {
    clear();
    toast({ title: "Đã xóa file", description: "Vui lòng tải lên file mới" });
  };

  /** Re-checks the page count right before generating; false when the file must not be sent. */
  const canGenerate = async () => {
    if (!file) return true;
    try {
      const { valid, pageCount } = await validatePdfPageCount(file);
      if (!valid) {
        tooManyPages(pageCount);
        return false;
      }
    } catch {
      // The upload already passed this check; let the server decide.
    }
    return true;
  };

  return { pickFile, removeFile, canGenerate };
}
