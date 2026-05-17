"use client";

import React, { useRef, useEffect } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/antd/card";
import { Button } from "@/components/antd/button";
import {
  SquareSplitVertical,
  ChevronLeft,
  ChevronRight,
  Upload,
  CircleHelp,
  Sparkles,
  Loader2,
  SaveAll,
  Cpu,
} from "lucide-react";
import { useToast } from "@/components/antd/toast";
import FileUpload from "@/components/kokonutui/file-upload";
import { Label } from "@/components/antd/label";
import ModelSelector from "@/components/atoms/ModelSelector";
import { Slider } from "@/components/antd/slider";
import { Switch } from "@/components/antd/switch";
import { Field, FieldContent, FieldLabel } from "@/components/antd/field";
import { Input } from "@/components/antd/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/antd/tooltip";
import { ItemFileDetail } from "@/components/atoms/k/ItemFileDetail";
import ModernLoader from "@/components/antd/modern-loader";
import { FlipCard } from "@/components/atoms/k/FlipCard";
import { useFlashcardGeneratorStore } from "@/stores/useAIGeneratorStore";
import { validatePdfPageCount } from "@/lib/pdfUtils";
import {
  DialogAddExam,
  DialogAddExamType,
} from "@/components/organisms/k/DialogAddExam";
import { useGenerationGuard } from "@/hooks/useGenerationGuard";

export function FlashcardGenerator() {
  const {
    file,
    uploadId,
    fileInfo,
    cardCount,
    isNarrow,
    keyword,
    generatedCards,
    currentCard,
    isGenerating,
    selectedModel,
    setFile,
    setCardCount,
    setIsNarrow,
    setKeyword,
    setCurrentCard,
    setSelectedModel,
    generateFlashcards,
    clearFlashcards,
  } = useFlashcardGeneratorStore();

  useGenerationGuard(isGenerating);

  const { toast } = useToast();
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGenerating && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isGenerating]);
  const displayFileName = file?.name || fileInfo?.name;
  const displayFileSize = file?.size || fileInfo?.size;
  const hasFile = !!file || !!uploadId;

  const handleFileUpload = async (uploadedFile: File) => {
    try {
      const { valid, pageCount } = await validatePdfPageCount(uploadedFile);
      if (!valid) {
        toast({
          title: "File PDF quá lớn",
          description: `File có ${pageCount} trang. Giới hạn tối đa là 50 trang.`,
          variant: "destructive",
        });
        return;
      }
    } catch (error) {
      toast({
        title: "Lỗi đọc file PDF",
        description:
          error instanceof Error ? error.message : "Không thể đọc file PDF",
        variant: "destructive",
      });
      return;
    }

    setFile(uploadedFile);
    toast({
      title: "File đã được tải lên",
      description: `${uploadedFile.name} (${(
        uploadedFile.size /
        1024 /
        1024
      ).toFixed(2)} MB)`,
    });
  };

  const handleFileError = (error: { message: string; code: string }) => {
    toast({
      title: "Lỗi tải file",
      description: error.message,
      variant: "destructive",
    });
  };

  const handleRemoveFile = () => {
    clearFlashcards();
    toast({
      title: "Đã xóa file",
      description: "Vui lòng tải lên file mới",
    });
  };

  const handleGenerate = async () => {
    if (file) {
      try {
        const { valid, pageCount } = await validatePdfPageCount(file);
        if (!valid) {
          toast({
            title: "File PDF quá lớn",
            description: `File có ${pageCount} trang. Giới hạn tối đa là 50 trang.`,
            variant: "warning",
          });
          return;
        }
      } catch {
        // Ignored
      }
    }

    await generateFlashcards();
  };

  const nextCard = () => {
    if (generatedCards && currentCard < generatedCards.length - 1) {
      setCurrentCard(currentCard + 1);
    }
  };

  const prevCard = () => {
    if (currentCard > 0) {
      setCurrentCard(currentCard - 1);
    }
  };

  return (
    <div className="grid w-full gap-6 lg:grid-cols-[420px_minmax(0,1fr)] xl:items-stretch">
      <div className="flex flex-col gap-4">
        <Card className="border-border bg-card shadow-none">
          <CardContent className="flex min-h-[252px] flex-col items-center justify-center px-3 md:px-6 py-7 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="max-w-[18rem] font-serif text-3xl font-normal leading-tight tracking-[-0.025em] text-foreground">
              Biến tài liệu thành kiến thức
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">Kéo thả PDF up to 100 MB</p>
            {!hasFile ? (
              <div className={isGenerating ? "pointer-events-none opacity-50 mt-5 w-full" : "mt-5 w-full"}>
                <FileUpload
                  acceptedFileTypes={[".pdf", "application/pdf"]}
                  maxFileSize={104857600}
                  className="w-full"
                  onUploadSuccess={handleFileUpload}
                  onUploadError={handleFileError}
                  uploadDelay={2000}
                />
              </div>
            ) : (
              <div className="mt-5 w-full">
                <ItemFileDetail
                  fileName={displayFileName || "Unknown file"}
                  fileSize={displayFileSize || 0}
                  onRemove={handleRemoveFile}
                  disabled={isGenerating}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-none">
          <CardContent className="space-y-6 px-3 md:px-6 py-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Cpu className="h-3.5 w-3.5" />
                AI Model
              </Label>
              <ModelSelector
                value={selectedModel}
                onChange={(value) => setSelectedModel(value as any)}
                className="w-full"
              />
              <p className="text-[11px] italic text-muted-foreground">AI2 / AI service offline</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-semibold text-foreground">Số lượng thẻ</Label>
                <input
                  type="number"
                  value={cardCount}
                  onChange={(e) => {
                    const val = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(val)) setCardCount(Math.min(100, Math.max(1, val)));
                  }}
                  className="h-7 w-16 rounded-md border border-border bg-muted px-1 text-center text-xs font-semibold text-foreground outline-none focus:border-primary"
                  min={1}
                  max={100}
                />
              </div>
              <Slider
                value={[Math.min(cardCount, 100)]}
                onValueChange={(value) => setCardCount(value[0])}
                min={5}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="narrow-toggle"
                className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground"
              >
                Định dạng nâng cao
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Bật để tạo flashcard tập trung vào từ khóa mà bạn nhập thay vì toàn file PDF
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                id="narrow-toggle"
                checked={isNarrow}
                onCheckedChange={setIsNarrow}
                className="cursor-pointer data-[state=checked]:bg-primary"
              />
            </div>

            {isNarrow && (
              <Field className="animate-in slide-in-from-top-2 duration-200">
                <FieldLabel htmlFor="keyword-input">Từ khóa</FieldLabel>
                <FieldContent>
                  <Input
                    id="keyword-input"
                    placeholder="Nhập từ khóa..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="border-border bg-muted"
                  />
                </FieldContent>
              </Field>
            )}

            <Button
              onClick={handleGenerate}
              disabled={!hasFile || isGenerating}
              variant="gradient"
              className="h-12 w-full text-sm font-semibold shadow-none"
              size="lg"
            >
              {isGenerating ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Đang tạo flashcard...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles className=" h-4 w-4" />
                  Tạo flashcard
                </div>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card ref={resultRef} className="min-h-[560px] border-border bg-background shadow-none">
        <CardHeader className="gap-4 border-b border-border px-3 md:px-6 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card">
                  <SquareSplitVertical className="h-4 w-4 text-accent-teal" />
                </div>
                Xem trước flashcard
              </CardTitle>
              <CardDescription>
                Preview khu vực phân tích nội dung.
              </CardDescription>
            </div>

            {generatedCards && generatedCards.length > 0 && !isGenerating && (
              <DialogAddExam
                title="Lưu vào flashcard set"
                description="Lưu flashcard vào hệ thống để tránh mất dữ liệu và lãng phí thời gian"
                type={DialogAddExamType.FLASH_CARD}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer border-border bg-card text-foreground !p-4 mb-2 md:mb-0 w-full md:w-auto"
                >
                  <SaveAll size={15} className="mr-2" />
                  Lưu
                </Button>
              </DialogAddExam>
            )}
          </div>

          {generatedCards && generatedCards.length > 0 && !isGenerating && (
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm text-muted-foreground">
              <span className="rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground mt-4">
                {generatedCards.length} thẻ flashcard
              </span>
              {isNarrow && keyword && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {keyword}
                </span>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="flex flex-1 flex-col px-0 md:px-6 mt-4">
          {isGenerating ? (
            <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-2xl border border-border bg-card px-6">
              <ModernLoader
                words={[
                  "Đang phân tích tài liệu…",
                  "Trích xuất thông tin…",
                  "Hiểu nội dung…",
                  "Xác minh dữ liệu…",
                  "Suy nghĩ về chủ đề…",
                  "Lập kế hoạch flashcard…",
                  "Tạo flashcard…",
                  "Đánh giá đáp án…",
                  "Kiểm tra độ chính xác…",
                  "Đảm bảo tính đa dạng…",
                  "Tối ưu hóa định dạng…",
                  "Chuẩn bị để hiển thị…",
                ]}
              />
            </div>
          ) : !generatedCards || generatedCards.length === 0 ? (
            <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center rounded-2xl bg-card px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-primary/15 bg-primary/10">
                <SquareSplitVertical className="h-7 w-7 text-primary" />
              </div>
              <p className="max-w-md text-sm text-muted-foreground md:text-base">
                Tải lên file PDF và nhấn Tạo flashcard để xem kết quả.
              </p>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-1 flex-col rounded-2xl border border-border bg-card p-4 md:p-6">
              <div className="flex items-center justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
                  <span className="text-primary/80">Thẻ</span>
                  <span>{currentCard + 1}</span>
                  <span className="text-primary/50">/</span>
                  <span>{generatedCards.length}</span>
                </div>
              </div>

              <div className="flex flex-1 items-center justify-center py-4 md:py-8">
                {generatedCards[currentCard] && (
                  <div className="mx-auto w-full">
                    <FlipCard
                      key={currentCard}
                      className="w-full"
                      front={{
                        label: "Câu hỏi",
                        content: generatedCards[currentCard].question,
                        hint: "Nhấn để xem câu trả lời",
                      }}
                      back={{
                        label: "Câu trả lời",
                        content: generatedCards[currentCard].answer,
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={prevCard}
                  disabled={currentCard === 0}
                  className="cursor-pointer border-border bg-card text-foreground"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={nextCard}
                  disabled={currentCard === generatedCards.length - 1}
                  className="cursor-pointer border-border bg-card text-foreground"
                >
                  Sau
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
