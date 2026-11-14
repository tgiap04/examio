import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { FileText, WandSparkles } from "lucide-react";
import { useTestGeneratorStore } from "@/stores/useAIGeneratorStore";
import { DialogAddExam, DialogAddExamType } from "@/components/organisms/k/DialogAddExam";
import { useGenerationGuard } from "@/hooks/useGenerationGuard";
import { ResultEmptyState } from "./ai-tool/ai-tool-ui";
import { GenerateCtaCard } from "./ai-tool/generate-cta-card";
import { GeneratorSettingsCard } from "./ai-tool/generator-settings-card";
import { GeneratorUploadCard } from "./ai-tool/generator-upload-card";
import { QuizResultList } from "./ai-tool/quiz-result-list";
import { ResultLoading, ResultPanel } from "./ai-tool/result-panel";
import { usePdfFileHandlers } from "./ai-tool/use-pdf-file-handlers";

/** `aside` renders below the generate card in the left column (the page puts the recent files there). */
export function TestGenerator({ aside }: { aside?: ReactNode }) {
  const {
    file,
    uploadId,
    fileInfo,
    questionCount,
    isNarrow,
    keyword,
    generatedTest,
    isGenerating,
    setFile,
    setQuestionCount,
    setIsNarrow,
    setKeyword,
    generateTest,
    clearTest,
  } = useTestGeneratorStore();

  useGenerationGuard(isGenerating);
  const { pickFile, removeFile, canGenerate } = usePdfFileHandlers({ file, setFile, clear: clearTest });

  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isGenerating) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isGenerating]);

  const hasFile = !!file || !!uploadId;
  const hasResult = !!generatedTest && generatedTest.length > 0 && !isGenerating;

  const handleGenerate = async () => {
    if (await canGenerate()) await generateTest();
  };

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <GeneratorUploadCard
          icon={<WandSparkles />}
          title="Tạo đề thi thông minh"
          subtitle="Từ tài liệu của bạn, chỉ với vài thao tác đơn giản"
          hasFile={hasFile}
          fileName={file?.name || fileInfo?.name}
          fileSize={file?.size || fileInfo?.size}
          disabled={isGenerating}
          onPick={pickFile}
          onRemove={removeFile}
        />
        <GeneratorSettingsCard
          idPrefix="test"
          title="Tùy chỉnh đề thi"
          countLabel="Số lượng câu hỏi"
          count={questionCount}
          onCountChange={setQuestionCount}
          isNarrow={isNarrow}
          onNarrowChange={setIsNarrow}
          narrowHint="Bật để tạo đề kiểm tra tập trung vào từ khóa bạn nhập thay vì toàn bộ file PDF"
          keyword={keyword}
          onKeywordChange={setKeyword}
          disabled={isGenerating}
        />
        <GenerateCtaCard
          title="Tạo đề thi với AI"
          loadingTitle="Đang tạo đề thi..."
          subtitle={hasFile ? "Tự động sinh đề thi từ nội dung tài liệu" : "Tải tài liệu lên để bắt đầu"}
          disabled={!hasFile || isGenerating}
          isLoading={isGenerating}
          onClick={handleGenerate}
        />
        {aside}
      </div>

      <ResultPanel
        ref={resultRef}
        icon={<FileText />}
        title="Kết quả đề kiểm tra"
        countLabel={hasResult ? `${generatedTest.length} câu hỏi` : undefined}
        keyword={isNarrow ? keyword : undefined}
        renderSave={
          hasResult
            ? (button) => (
                <DialogAddExam
                  title="Lưu vào đề thi"
                  description="Lưu đề kiểm tra vào hệ thống để tránh mất dữ liệu và lãng phí thời gian"
                  type={DialogAddExamType.QUIZZ}
                >
                  {button}
                </DialogAddExam>
              )
            : undefined
        }
      >
        {isGenerating ? (
          <ResultLoading itemWord="câu hỏi" />
        ) : hasResult ? (
          <QuizResultList questions={generatedTest} />
        ) : (
          <ResultEmptyState icon={<FileText />} text="Tải lên file PDF và nhấn Tạo đề thi với AI để xem kết quả." />
        )}
      </ResultPanel>
    </div>
  );
}
