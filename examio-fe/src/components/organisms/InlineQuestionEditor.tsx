import { useState, useEffect } from "react";
import { Button } from "@/components/antd/button";
import { Label } from "@/components/antd/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/antd/select";
import { RichTextEditor } from "@/components/molecules/RichTextEditor";
import { cn } from "@/lib/utils";
import { quizOptionToText, resolveAnswerIndex } from "@/lib/quizAnswerUtils";
import { Plus, X, Tag, Check } from "lucide-react";
import type { Quizz, QuizSetLabel } from "@/types/quizset";
import { getQuizSetLabelsApi } from "@/apis/quizsetApi";

export interface InlineQuestionFormData {
  question: string;
  options: string[];
  answer: string;
  labelId?: string | null;
}

interface InlineQuestionEditorProps {
  question: Quizz | null;
  quizSetId: string;
  labels?: QuizSetLabel[];
  onSave: (data: InlineQuestionFormData) => void;
  onCancel: () => void;
  editorRef?: React.RefObject<HTMLDivElement | null>;
}

export function InlineQuestionEditor({
  question,
  quizSetId,
  labels: labelsProp,
  onSave,
  onCancel,
  editorRef,
}: InlineQuestionEditorProps) {
  const getInitialOptions = (q: Quizz | null): string[] => {
    if (!q) return ["", "", "", ""];
    const cleaned = q.options.map(quizOptionToText);
    return cleaned.length >= 4
      ? cleaned
      : [...cleaned, ...Array.from({ length: 4 - cleaned.length }, () => "")];
  };

  const getInitialAnswer = (q: Quizz | null): string => {
    if (!q?.answer) return "";
    return String(resolveAnswerIndex(q.answer, q.options));
  };

  const [questionText, setQuestionText] = useState(question?.question ?? "");
  const [options, setOptions] = useState(() => getInitialOptions(question));
  const [correctAnswer, setCorrectAnswer] = useState(() => getInitialAnswer(question));
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(
    question?.labelId ?? question?.label?.id ?? null
  );
  const [labels, setLabels] = useState<QuizSetLabel[]>(labelsProp ?? []);

  const indexToLetter = (index: string): string => {
    if (!index) return "";
    const num = Number.parseInt(index);
    if (Number.isNaN(num)) return index;
    return String.fromCharCode(65 + num);
  };

  // Sync labels
  useEffect(() => {
    if (labelsProp !== undefined) {
      setLabels(labelsProp);
    } else if (quizSetId) {
      getQuizSetLabelsApi(quizSetId)
        .then((res) => setLabels(res.labels))
        .catch(() => setLabels([]));
    }
  }, [quizSetId, labelsProp]);

  // Sync all state when question prop changes
  useEffect(() => {
    setQuestionText(question?.question ?? "");
    setOptions(getInitialOptions(question));
    setCorrectAnswer(getInitialAnswer(question));
    setSelectedLabelId(question?.labelId ?? question?.label?.id ?? null);
  }, [question]);

  const handleAddOption = () => setOptions((prev) => [...prev, ""]);

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
      const ca = Number.parseInt(correctAnswer);
      if (correctAnswer === String(index)) {
        setCorrectAnswer("");
      } else if (!Number.isNaN(ca) && ca > index) {
        setCorrectAnswer(String(ca - 1));
      }
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || "";
  };

  const handleSave = () => {
    if (!stripHtml(questionText).trim()) return;
    const filledOptions = options.filter((opt) => stripHtml(opt).trim());
    if (filledOptions.length < 2) return;
    if (!correctAnswer || !stripHtml(options[Number.parseInt(correctAnswer)] ?? "").trim()) return;
    onSave({
      question: questionText,
      options: options.filter((opt) => stripHtml(opt).trim()),
      answer: indexToLetter(correctAnswer),
      labelId: selectedLabelId,
    });
  };

  const selectedLabel = labels.find((l) => l.id === selectedLabelId);

  return (
    <div
      ref={editorRef}
      className="rounded-[12px] border-2 border-coral/30 bg-surface-soft p-5 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">
          {question ? "Chỉnh sửa câu hỏi" : "Thêm câu hỏi mới"}
        </h3>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Question text */}
      <div className="space-y-2">
        <Label>Câu hỏi <span className="text-error">*</span></Label>
        <RichTextEditor
          content={questionText}
          onChange={setQuestionText}
          placeholder="Nhập nội dung câu hỏi..."
          minHeight="120px"
        />
      </div>

      {/* Label selector */}
      {labels.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5" />
            Nhãn
          </Label>
          <Select
            value={selectedLabelId ?? "none"}
            onValueChange={(v) => setSelectedLabelId(v === "none" ? null : v)}
          >
            <SelectTrigger className="w-fit">
              <SelectValue placeholder="Chưa chọn nhãn" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Không gán nhãn</SelectItem>
              {labels.map((lbl) => (
                <SelectItem key={lbl.id} value={lbl.id}>
                  <span className="flex items-center gap-2">
                    {lbl.color && (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: lbl.color }}
                      />
                    )}
                    {lbl.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Answer options */}
      <div className="space-y-3">
        <Label>Đáp án <span className="text-error">*</span></Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-stretch rounded-[8px] border p-2 transition-colors",
                correctAnswer === String(idx)
                  ? "border-coral/50 bg-coral/5"
                  : "border-hairline hover:border-coral/30",
              )}
            >
              <div
                className="flex flex-col items-center justify-start gap-1 pr-2 cursor-pointer"
                onClick={() => setCorrectAnswer(String(idx))}
              >
                <input
                  type="radio"
                  name={`correct-answer-${question?.id ?? "new"}`}
                  checked={correctAnswer === String(idx)}
                  onChange={() => setCorrectAnswer(String(idx))}
                  className="h-4 w-4 accent-coral"
                />
                <span className="font-mono text-sm text-muted-foreground leading-none">
                  {String.fromCharCode(65 + idx)}.
                </span>
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveOption(idx);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                <RichTextEditor
                  content={option}
                  onChange={(value) => handleOptionChange(idx, value)}
                  placeholder={`Đáp án ${String.fromCharCode(65 + idx)}`}
                  minHeight="120px"
                />
              </div>
            </div>
          ))}
        </div>

        {options.length < 6 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddOption}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Thêm đáp án
          </Button>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2 border-t border-hairline">
        <Button variant="outline" size="sm" onClick={onCancel}>Hủy</Button>
        <Button size="sm" onClick={handleSave}>
          <Check className="mr-1.5 h-3.5 w-3.5" />
          {question ? "Cập nhật" : "Thêm"}
        </Button>
      </div>
    </div>
  );
}
