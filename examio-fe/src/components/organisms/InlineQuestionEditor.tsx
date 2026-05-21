import { useState, useEffect } from "react";
import { Button } from "@/components/antd/button";
import { Label } from "@/components/antd/label";
import { RadioGroup, RadioGroupItem } from "@/components/antd/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/antd/select";
import { RichTextEditor } from "@/components/molecules/RichTextEditor";
import { Plus, X, Tag, Check } from "lucide-react";
import type { Quizz } from "@/types/quizset";
import { getQuizSetLabelsApi, type QuizSetLabel } from "@/apis/quizsetApi";

export interface InlineQuestionFormData {
  question: string;
  options: string[];
  answer: string;
  labelId?: string | null;
}

interface InlineQuestionEditorProps {
  question: Quizz | null;
  quizSetId: string;
  onSave: (data: InlineQuestionFormData) => void;
  onCancel: () => void;
}

export function InlineQuestionEditor({
  question,
  quizSetId,
  onSave,
  onCancel,
}: InlineQuestionEditorProps) {
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [labels, setLabels] = useState<QuizSetLabel[]>([]);

  const letterToIndex = (letter: string): string => {
    if (!letter) return "";
    if (!Number.isNaN(Number.parseInt(letter))) return letter;
    return (letter.charCodeAt(0) - 65).toString();
  };

  const indexToLetter = (index: string): string => {
    if (!index) return "";
    const num = Number.parseInt(index);
    if (Number.isNaN(num)) return index;
    return String.fromCharCode(65 + num);
  };

  useEffect(() => {
    if (question) {
      setQuestionText(question.question);
      const filledOptions =
        question.options.length >= 4
          ? question.options
          : [...question.options, ...Array.from({ length: 4 - question.options.length }).fill("") as string[]];
      setOptions(filledOptions);
      setCorrectAnswer(letterToIndex(question.answer));
      setSelectedLabelId(question.label?.id || null);
    } else {
      setQuestionText("");
      setOptions(["", "", "", ""]);
      setCorrectAnswer("");
      setSelectedLabelId(null);
    }
  }, [question]);

  useEffect(() => {
    if (quizSetId) {
      getQuizSetLabelsApi(quizSetId)
        .then((response) => setLabels(response.labels))
        .catch(() => setLabels([]));
    }
  }, [quizSetId]);

  const handleAddOption = () => setOptions([...options, ""]);

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
      if (correctAnswer === index.toString()) {
        setCorrectAnswer("");
      } else if (Number.parseInt(correctAnswer) > index) {
        setCorrectAnswer((Number.parseInt(correctAnswer) - 1).toString());
      }
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSave = () => {
    if (!questionText.trim()) return;
    const filledOptions = options.filter((opt) => opt.trim());
    if (filledOptions.length < 2) return;
    if (!correctAnswer || !options[Number.parseInt(correctAnswer)]?.trim()) return;

    onSave({
      question: questionText,
      options: filledOptions,
      answer: indexToLetter(correctAnswer),
      labelId: selectedLabelId,
    });
  };

  return (
    <div className="rounded-[12px] border-2 border-coral/30 bg-surface-soft p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">
          {question ? "Chỉnh sửa câu hỏi" : "Thêm câu hỏi mới"}
        </h3>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Câu hỏi <span className="text-error">*</span></Label>
        <RichTextEditor
          content={questionText}
          onChange={setQuestionText}
          placeholder="Nhập nội dung câu hỏi..."
          minHeight="120px"
        />
      </div>

      {labels.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5" />
            Nhãn
          </Label>
          <Select
            value={selectedLabelId || "none"}
            onValueChange={(value) => setSelectedLabelId(value === "none" ? null : value)}
          >
            <SelectTrigger className="w-fit">
              <SelectValue placeholder="Chọn nhãn..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Không gán nhãn</SelectItem>
              {labels.map((label) => (
                <SelectItem key={label.id} value={label.id}>
                  <div className="flex items-center gap-2">
                    {label.color && (
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                    )}
                    <span>{label.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-3">
        <Label>Đáp án <span className="text-error">*</span></Label>
        <RadioGroup value={correctAnswer} onValueChange={setCorrectAnswer}>
          {options.map((option, index) => (
            <div key={index} className="flex items-start gap-2">
              <RadioGroupItem
                value={index.toString()}
                id={`inline-opt-${index}`}
                disabled={!option.trim()}
                className="mt-3"
              />
              <div className="flex-shrink-0 mt-3 font-mono text-sm text-muted-foreground">
                {String.fromCharCode(65 + index)}.
              </div>
              <div className="flex-1">
                <RichTextEditor
                  content={option}
                  onChange={(value) => handleOptionChange(index, value)}
                  placeholder={`Đáp án ${String.fromCharCode(65 + index)}`}
                  minHeight="80px"
                />
              </div>
              {options.length > 2 && (
                <Button variant="ghost" size="sm" onClick={() => handleRemoveOption(index)} className="mt-2">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </RadioGroup>

        {options.length < 6 && (
          <Button variant="outline" size="sm" onClick={handleAddOption} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Thêm đáp án
          </Button>
        )}
      </div>

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
