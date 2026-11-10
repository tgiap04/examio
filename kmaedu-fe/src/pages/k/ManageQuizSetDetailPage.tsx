import { useEffect, useState, useCallback, useRef } from "react";
import { Search, X,
  Plus,
  Share2,
  Trash2,
  FileText,
  Edit,
  ChevronLeft,
  ChevronRight } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuizSetStore } from "@/stores/useQuizSetStore";
import { Button } from "@/components/antd/button";
import { Card } from "@/components/antd/card";
import { Badge } from "@/components/antd/badge";
import { Skeleton } from "@/components/antd/skeleton";
import { isCorrectAnswer, quizOptionToText } from "@/lib/quizAnswerUtils";
import { cn } from "@/lib/utils";
import type { Quizz } from "@/types/quizset";
import { DeleteConfirmDialog } from "@/components/organisms/DeleteConfirmDialog";
import { ShareQuizSetModal } from "@/components/organisms/ShareQuizSetModal";
import { InlineQuestionEditor, type InlineQuestionFormData } from "@/components/organisms/InlineQuestionEditor";
import { LabelManager } from "@/components/organisms/LabelManager";
import { RichTextViewer } from "@/components/molecules/RichTextViewer";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/antd/breadcrumb";
import { getQuizSetQuestionsApi, updateQuestionInQuizSet, type PaginationInfo } from "@/apis/quizsetApi";
import { useDebounce } from "@/hooks/useDebounce";
import { storeCache } from "@/lib/storeCache";
import { Input } from "@/components/antd/input";

export default function ManageQuizSetDetailPage() {
  const { id = "" } = useParams();
  const {
    currentQuizSet,
    loading,
    fetchQuizSetById,
    addQuestion,
    updateQuestion,
    deleteQuestion,
  } = useQuizSetStore();

  const [selectedQuestion, setSelectedQuestion] = useState<Quizz | null>(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginatedQuestions, setPaginatedQuestions] = useState<Quizz[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const itemsPerPage = 9;
  const addEditorRef = useRef<HTMLDivElement>(null);
  const editEditorRef = useRef<HTMLDivElement>(null);
  const [questionSearch, setQuestionSearch] = useState("");
  const debouncedSearch = useDebounce(questionSearch, 300);

  // Cache key generator for questions by label
  const getLabelQuestionsCacheKey = (labelId: string) =>
    storeCache.createKey("questions-by-label", { quizSetId: id, labelId });

  // Invalidate label questions cache when question CUD or label CUD
  const invalidateLabelQuestionsCache = (labelId: string) => {
    const cacheKey = getLabelQuestionsCacheKey(labelId);
    storeCache.invalidate(cacheKey);
  };

  // Handle label change from LabelManager
  const handleLabelChange = useCallback(
    (_action: "create" | "update" | "delete", labelId?: string) => {
      if (labelId) {
        invalidateLabelQuestionsCache(labelId);
      }
    },
    [],
  );

  useEffect(() => {
    if (id) {
      fetchQuizSetById(id);
    }
  }, [id, fetchQuizSetById]);

  const fetchQuestions = useCallback(async () => {
    if (!id) return;

    setQuestionsLoading(true);
    try {
      const response = await getQuizSetQuestionsApi(id, currentPage, itemsPerPage);
      setPaginatedQuestions(response.questions);
      setPagination(response.pagination);
    } catch (error) {
      console.error("Failed to fetch questions:", error);
    } finally {
      setQuestionsLoading(false);
    }
  }, [id, currentPage]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleAddQuestion = useCallback(() => {
    setSelectedQuestion(null);
    setShowQuestionForm(true);
  }, []);

  const handleEditQuestion = useCallback((question: Quizz) => {
    setSelectedQuestion(question);
    setShowQuestionForm(true);
  }, []);

  const handleDeleteQuestion = useCallback((questionId: string) => {
    setQuestionToDelete(questionId);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (questionToDelete && id) {
      // Find the question to get its labelId before deletion
      const questionToDeleteObj = paginatedQuestions.find((q) => q.id === questionToDelete);
      const questionLabelId = questionToDeleteObj?.label?.id;

      await deleteQuestion(id, questionToDelete);
      setIsDeleteDialogOpen(false);
      setQuestionToDelete(null);

      // Invalidate label cache if question had label
      if (questionLabelId) {
        invalidateLabelQuestionsCache(questionLabelId);
      }

      if (paginatedQuestions.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
        await fetchQuestions();
      } else {
        await fetchQuestions();
      }
    }
  }, [questionToDelete, id, deleteQuestion, paginatedQuestions, currentPage, fetchQuestions]);

  const handleSaveQuestion = useCallback(
    async (questionData: InlineQuestionFormData) => {
      if (!id) return;

      if (selectedQuestion) {
        // Call API directly and update local state with returned data
        const response = await updateQuestionInQuizSet(id, selectedQuestion.id, questionData);
        setPaginatedQuestions((prev) =>
          prev.map((q) => (q.id === selectedQuestion.id ? response.question : q))
        );
        // Invalidate label cache if question has label
        if (selectedQuestion.label?.id) {
          invalidateLabelQuestionsCache(selectedQuestion.label.id);
        }
      } else {
        await addQuestion(id, questionData);
        await fetchQuestions();
      }

      setShowQuestionForm(false);
      setSelectedQuestion(null);
    },
    [selectedQuestion, id, addQuestion, fetchQuestions],
  );

  const totalQuestions = pagination?.total || 0;
  const totalPages = pagination?.totalPages || 0;

  if (loading || !currentQuizSet) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8">
          <Skeleton className="mb-6 h-10 w-full" />
          <div className="mb-8 grid gap-6 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex-1">
              <Breadcrumb className="mt-4">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/k/manage-exam">Quản lý bộ đề</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{currentQuizSet.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsShareOpen(true)}>
                <Share2 className="mr-2 h-4 w-4" />
                Chia sẻ
              </Button>
            </div>
          </div>

          {currentQuizSet.tags && currentQuizSet.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentQuizSet.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <Card className="p-3 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-3">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tổng số câu hỏi</p>
                <p className="text-2xl font-bold">{totalQuestions}</p>
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-3">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Ngày tạo</p>
                <p className="text-sm font-medium">
                  {new Date(currentQuizSet.createdAt).toLocaleDateString("vi-VN")}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <LabelManager quizSetId={id} onLabelChange={handleLabelChange} />

        <Card className="p-3 sm:p-6">
          <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              Danh sách câu hỏi
              {totalQuestions > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">({totalQuestions} câu)</span>
              )}
            </h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm câu hỏi..."
                  value={questionSearch}
                  onChange={(e) => {
                    setQuestionSearch(e.target.value);
                    if (e.target.value) setCurrentPage(1);
                  }}
                  className="pl-9 pr-9"
                />
                {questionSearch && (
                  <button
                    onClick={() => { setQuestionSearch(""); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button onClick={handleAddQuestion} disabled={showQuestionForm}>
                <Plus className="mr-2 h-4 w-4" />
                Thêm câu hỏi
              </Button>
            </div>
          </div>

          {showQuestionForm && !selectedQuestion && (
            <div className="mb-6">
              <InlineQuestionEditor
                question={null}
                quizSetId={id}
                labels={currentQuizSet.labels}
                onSave={handleSaveQuestion}
                onCancel={() => { setShowQuestionForm(false); setSelectedQuestion(null); }}
                editorRef={addEditorRef}
              />
            </div>
          )}

          {questionsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : paginatedQuestions.length > 0 ? (
            <div className="space-y-4">
              {/* Filter + highlight search matches */}
              {(() => {
                const displayed = debouncedSearch
                  ? paginatedQuestions.filter((q) => {
                    const text = q.question.replace(/<[^>]+>/g, "").toLowerCase();
                    return text.includes(debouncedSearch.toLowerCase());
                  })
                  : paginatedQuestions;

                if (debouncedSearch && displayed.length === 0) {
                  return (
                    <div className="py-8 text-center text-muted-foreground">
                      <Search className="mx-auto mb-3 h-10 w-10 opacity-40" />
                      <p>Không tìm thấy câu hỏi phù hợp</p>
                    </div>
                  );
                }

                return displayed.map((question, index) => {
                  const actualIndex = (currentPage - 1) * itemsPerPage + index;
                  const isEditing = showQuestionForm && selectedQuestion?.id === question.id;

                  // Highlight search matches in question text
                  const highlightText = (html: string): React.ReactNode => {
                    if (!debouncedSearch) return <RichTextViewer content={html} />;
                    const plainText = html.replace(/<[^>]+>/g, "");
                    const escaped = debouncedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const regex = new RegExp(`(${escaped})`, "gi");
                    const parts = plainText.split(regex);
                    return (
                      <span>
                        {parts.map((part, i) =>
                          regex.test(part) ? (
                            <mark key={i} className="bg-yellow-200">{part}</mark>
                          ) : (
                            <RichTextViewer key={i} content={html} />
                          )
                        )}
                      </span>
                    );
                  };

                  if (isEditing) {
                    return (
                      <InlineQuestionEditor
                        key={question.id}
                        question={question}
                        quizSetId={id}
                        labels={currentQuizSet.labels}
                        onSave={handleSaveQuestion}
                        onCancel={() => { setShowQuestionForm(false); setSelectedQuestion(null); }}
                        editorRef={editEditorRef}
                      />
                    );
                  }

                  return (
                    <div key={question.id} className="rounded-[12px] border border-hairline p-4 transition-shadow hover:shadow-[0_1px_3px_rgba(20,20,19,0.08)]">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-coral/15 font-mono text-xs font-semibold text-coral">
                          {actualIndex + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-3">
                          {question.label && (
                            <div
                              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor: question.label.color ? `${question.label.color}15` : undefined,
                                borderColor: question.label.color || undefined,
                                color: question.label.color || undefined,
                              }}
                            >
                              {question.label.color && (
                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: question.label.color }} />
                              )}
                              {question.label.name}
                            </div>
                          )}
                          <div className="text-[14px] font-medium leading-[1.55]">
                            {debouncedSearch ? highlightText(question.question) : <RichTextViewer content={question.question} />}
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            {question.options.map((option, optIndex) => {
                              const isCorrect = isCorrectAnswer(question.answer, optIndex, question.options);
                              const optionText = quizOptionToText(option);
                              const hasPrefix = /^[A-D]\s*[.):]\s+/.test(optionText);
                              const displayText = hasPrefix ? optionText.replace(/^[A-D]\s*[.):]\s+/, "") : optionText;

                              return (
                                <div
                                  key={optIndex}
                                  className={cn(
                                    "flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px] transition-colors",
                                    isCorrect
                                      ? "border-coral/40 bg-coral/10 text-ink"
                                      : "border-hairline text-muted-foreground",
                                  )}
                                >
                                  <span className="font-mono text-[11px]">
                                    {String.fromCharCode(65 + optIndex)}.
                                  </span>
                                  <span className="flex-1 mt-3">
                                    <RichTextViewer content={displayText} />
                                  </span>
                                  {isCorrect && <span className="text-[11px] text-coral font-medium">✓</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEditQuestion(question)} disabled={showQuestionForm} className="h-8 w-8 p-0">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteQuestion(question.id)} disabled={showQuestionForm} className="h-8 w-8 p-0 text-muted-foreground hover:text-error">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}

              {/* Pagination — hidden when searching */}
              {!debouncedSearch && totalPages > 1 && (
                <div className="flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Hiển thị {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalQuestions)} / {totalQuestions} câu hỏi
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                      <ChevronLeft className="h-4 w-4" />
                      Trước
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) pageNum = i + 1;
                        else if (currentPage <= 3) pageNum = i + 1;
                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = currentPage - 2 + i;
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setCurrentPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                      Sau
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>Chưa có câu hỏi nào</p>
              <p className="mt-2 text-sm">Nhấn "Thêm câu hỏi" để bắt đầu tạo bộ đề</p>
            </div>
          )}
        </Card>
      </div>

      <ShareQuizSetModal open={isShareOpen} onOpenChange={setIsShareOpen} quizSetId={id} />

      <DeleteConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Xóa câu hỏi"
        description="Bạn có chắc chắn muốn xóa câu hỏi này? Hành động này không thể hoàn tác."
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
