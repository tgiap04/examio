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
import { Label } from "@/components/antd/label";
import ModelSelector from "@/components/atoms/ModelSelector";
import { Slider } from "@/components/antd/slider";
import {
  Loader2,
  Sparkles,
  SaveAll,
  Upload,
  FileText,
  CircleHelp,
  CheckCircle2,
  Cpu,
} from "lucide-react";
import { useToast } from "@/components/antd/toast";
import FileUpload from "@/components/kokonutui/file-upload";
import { ItemFileDetail } from "@/components/atoms/k/ItemFileDetail";
import { ScrollArea } from "@/components/antd/scroll-area";
import { Switch } from "@/components/antd/switch";
import { Field, FieldContent, FieldLabel } from "@/components/antd/field";
import { Input } from "@/components/antd/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/antd/tooltip";
import ModernLoader from "@/components/antd/modern-loader";
import { Quizz } from "@/types/exam";
import { useTestGeneratorStore } from "@/stores/useAIGeneratorStore";
import { validatePdfPageCount } from "@/lib/pdfUtils";
import {
  DialogAddExam,
  DialogAddExamType,
} from "@/components/organisms/k/DialogAddExam";
import { cn } from "@/lib/utils";
import { useGenerationGuard } from "@/hooks/useGenerationGuard";

export function TestGenerator() {
  const {
    file,
    uploadId,
    fileInfo,
    questionCount,
    isNarrow,
    keyword,
    generatedTest,
    isGenerating,
    selectedModel,
    setFile,
    setQuestionCount,
    setIsNarrow,
    setKeyword,
    setSelectedModel,
    generateTest,
    clearTest,
  } = useTestGeneratorStore();

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
    clearTest();
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
          toast.warning("File PDF quá lớn", {
            description: `File có ${pageCount} trang. Giới hạn tối đa là 50 trang.`,
          });
          return;
        }
      } catch {
        // Ignored
      }
    }

    await generateTest();
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
                <Label className="text-xs font-semibold text-foreground">Số lượng</Label>
                <input
                  type="number"
                  value={questionCount}
                  onChange={(e) => {
                    const val = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(val)) setQuestionCount(Math.min(100, Math.max(1, val)));
                  }}
                  className="h-7 w-16 rounded-md border border-border bg-muted px-1 text-center text-xs font-semibold text-foreground outline-none focus:border-primary"
                  min={1}
                  max={100}
                />
              </div>
              <Slider
                value={[Math.min(questionCount, 100)]}
                onValueChange={(value) => setQuestionCount(value[0])}
                min={5}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="narrow-toggle-test"
                className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground"
              >
                Định dạng nâng cao
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Bật để tạo đề kiểm tra tập trung vào từ khóa mà bạn nhập thay vì toàn file PDF
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                id="narrow-toggle-test"
                checked={isNarrow}
                onCheckedChange={setIsNarrow}
                className="cursor-pointer data-[state=checked]:bg-primary"
              />
            </div>

            {isNarrow && (
              <Field className="animate-in slide-in-from-top-2 duration-200">
                <FieldLabel htmlFor="keyword-input-test">Từ khóa</FieldLabel>
                <FieldContent>
                  <Input
                    id="keyword-input-test"
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
                  Đang tạo đề...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <p className="h-4 pt-1">Tạo đề kiểm tra</p>
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
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                Kết quả đề kiểm tra
              </CardTitle>
              <CardDescription>
                Preview khu vực phân tích nội dung.
              </CardDescription>
            </div>

            {generatedTest && !isGenerating && (
              <DialogAddExam
                title="Lưu vào đề thi"
                description="Lưu đề kiểm tra vào hệ thống để tránh mất dữ liệu và lãng phí thời gian"
                type={DialogAddExamType.QUIZZ}
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

          {generatedTest && !isGenerating && (
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm text-muted-foreground">
              <span className="rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground mt-4">
                {generatedTest.length} câu hỏi
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
                  "Lập kế hoạch câu hỏi…",
                  "Tạo câu hỏi…",
                  "Đánh giá đáp án…",
                  "Kiểm tra độ chính xác…",
                  "Đảm bảo tính đa dạng…",
                  "Tối ưu hóa định dạng…",
                  "Chuẩn bị để hiển thị…",
                ]}
              />
            </div>
          ) : !generatedTest ? (
            <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center rounded-2xl bg-card px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-primary/15 bg-primary/10">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <p className="max-w-md text-sm text-muted-foreground md:text-base">
                Tải lên file PDF và nhấn Tạo đề kiểm tra để xem kết quả.
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1 min-h-[360px] rounded-2xl border border-border bg-card">
              <div className="space-y-3 p-3 md:space-y-4 md:p-6 md:pr-7 max-h-[600px] overflow-y-auto">
                {generatedTest.map((q: Quizz, idx: number) => {
                  const answerIndex =
                    typeof q.answer === "number"
                      ? q.answer
                      : ["A", "B", "C", "D"].indexOf(q.answer.toUpperCase());

                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-border bg-background p-3 md:rounded-2xl md:p-5"
                    >
                      <div className="flex items-start gap-3 md:gap-4">
                        <span className="mt-0.5 flex h-8 w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg md:rounded-xl bg-primary/10 text-xs md:text-sm font-semibold text-primary">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-3 md:space-y-4">
                          <p className="text-sm font-semibold leading-6 text-foreground md:text-base md:leading-7">
                            {q.question}
                          </p>

                          <div className="grid gap-2">
                            {q.options.map((opt: string, optIdx: number) => {
                              const isCorrect = answerIndex === optIdx;

                              return (
                                <div
                                  key={optIdx}
                                  className={cn(
                                    "flex items-start gap-2.5 rounded-lg border p-2.5 md:gap-3 md:rounded-xl md:p-3 transition-colors",
                                    isCorrect
                                      ? "border-accent-teal/30 bg-accent-teal/10"
                                      : "border-border bg-card",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                                      isCorrect
                                        ? "bg-accent-teal/15 text-accent-teal"
                                        : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span
                                    className={cn(
                                      "flex-1 text-sm leading-5 md:leading-6",
                                      isCorrect
                                        ? "text-accent-teal"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {opt}
                                  </span>
                                  {isCorrect && (
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-teal" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
