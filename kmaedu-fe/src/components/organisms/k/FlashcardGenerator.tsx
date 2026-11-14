import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Layers, WandSparkles } from "lucide-react";
import { useFlashcardGeneratorStore } from "@/stores/useAIGeneratorStore";
import { DialogAddExam, DialogAddExamType } from "@/components/organisms/k/DialogAddExam";
import { useGenerationGuard } from "@/hooks/useGenerationGuard";
import { ResultEmptyState } from "./ai-tool/ai-tool-ui";
import { FlashcardResultPreview } from "./ai-tool/flashcard-result-preview";
import { GenerateCtaCard } from "./ai-tool/generate-cta-card";
import { GeneratorSettingsCard } from "./ai-tool/generator-settings-card";
import { GeneratorUploadCard } from "./ai-tool/generator-upload-card";
import { ResultLoading, ResultPanel } from "./ai-tool/result-panel";
import { usePdfFileHandlers } from "./ai-tool/use-pdf-file-handlers";

/** `aside` renders below the generate card in the left column (the page puts the recent files there). */
export function FlashcardGenerator({ aside }: { aside?: ReactNode }) {
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
    setFile,
    setCardCount,
    setIsNarrow,
    setKeyword,
    setCurrentCard,
    generateFlashcards,
    clearFlashcards,
  } = useFlashcardGeneratorStore();

  useGenerationGuard(isGenerating);
  const { pickFile, removeFile, canGenerate } = usePdfFileHandlers({ file, setFile, clear: clearFlashcards });

  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isGenerating) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isGenerating]);

  const hasFile = !!file || !!uploadId;
  const hasResult = !!generatedCards && generatedCards.length > 0 && !isGenerating;

  const handleGenerate = async () => {
    if (await canGenerate()) await generateFlashcards();
  };

  const goToCard = (index: number) => {
    if (!generatedCards) return;
    setCurrentCard(Math.min(generatedCards.length - 1, Math.max(0, index)));
  };

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <GeneratorUploadCard
          icon={<WandSparkles />}
          title="Tạo flashcard thông minh"
          subtitle="Biến tài liệu thành bộ thẻ ghi nhớ chỉ trong vài giây"
          hasFile={hasFile}
          fileName={file?.name || fileInfo?.name}
          fileSize={file?.size || fileInfo?.size}
          disabled={isGenerating}
          onPick={pickFile}
          onRemove={removeFile}
        />
        <GeneratorSettingsCard
          idPrefix="flashcard"
          title="Tùy chỉnh flashcard"
          countLabel="Số lượng thẻ"
          count={cardCount}
          onCountChange={setCardCount}
          isNarrow={isNarrow}
          onNarrowChange={setIsNarrow}
          narrowHint="Bật để tạo flashcard tập trung vào từ khóa bạn nhập thay vì toàn bộ file PDF"
          keyword={keyword}
          onKeywordChange={setKeyword}
          disabled={isGenerating}
        />
        <GenerateCtaCard
          title="Tạo flashcard với AI"
          loadingTitle="Đang tạo flashcard..."
          subtitle={hasFile ? "Tự động sinh thẻ ghi nhớ từ nội dung tài liệu" : "Tải tài liệu lên để bắt đầu"}
          disabled={!hasFile || isGenerating}
          isLoading={isGenerating}
          onClick={handleGenerate}
        />
        {aside}
      </div>

      <ResultPanel
        ref={resultRef}
        icon={<Layers />}
        title="Xem trước flashcard"
        countLabel={hasResult ? `${generatedCards.length} thẻ flashcard` : undefined}
        keyword={isNarrow ? keyword : undefined}
        renderSave={
          hasResult
            ? (button) => (
                <DialogAddExam
                  title="Lưu vào flashcard set"
                  description="Lưu flashcard vào hệ thống để tránh mất dữ liệu và lãng phí thời gian"
                  type={DialogAddExamType.FLASH_CARD}
                >
                  {button}
                </DialogAddExam>
              )
            : undefined
        }
      >
        {isGenerating ? (
          <ResultLoading itemWord="flashcard" />
        ) : hasResult ? (
          <FlashcardResultPreview cards={generatedCards} current={currentCard} onChange={goToCard} />
        ) : (
          <ResultEmptyState icon={<Layers />} text="Tải lên file PDF và nhấn Tạo flashcard với AI để xem kết quả." />
        )}
      </ResultPanel>
    </div>
  );
}
