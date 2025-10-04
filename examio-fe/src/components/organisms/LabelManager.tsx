"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { Button } from "@/components/antd/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/antd/card";
import { Badge } from "@/components/antd/badge";
import { Input } from "@/components/antd/input";
import { Label } from "@/components/antd/label";
import { Textarea } from "@/components/antd/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/antd/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/antd/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/antd/tabs";
import { Tag, Plus, MoreVertical, Edit, Trash2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  QuizSetLabel,
  getQuizSetLabelsApi,
  createLabelApi,
  updateLabelApi,
  deleteLabelApi,
  getQuestionsByLabelApi,
} from "@/apis/quizsetApi";
import { toast } from "@/components/antd/toast";
import { RichTextViewer } from "@/components/molecules/RichTextViewer";
import { useQuizSetStore } from "@/stores/useQuizSetStore";

import { useDebounce } from "@/hooks/useDebounce";
import { isCorrectAnswer, quizOptionToText } from "@/lib/quizAnswerUtils";
import type { Quizz } from "@/types/quizset";
import { storeCache } from "@/lib/storeCache";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlights occurrences of `search` inside `text` by splitting the plain
 * text into React text-node segments (never raw HTML), so React escapes
 * every segment automatically. This avoids dangerouslySetInnerHTML entirely.
 */
function highlightMatches(text: string, search: string) {
  if (!search) {
    return text;
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(search)})`, "gi"));

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-yellow-200">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

const LABEL_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
];

interface LabelManagerProps {
  quizSetId: string;
  /** Called when a label is created, updated, or deleted */
  onLabelChange?: (action: "create" | "update" | "delete", labelId?: string) => void;
}

export function LabelManager({ quizSetId, onLabelChange }: LabelManagerProps) {
  const { invalidateCache } = useQuizSetStore();
  const [labels, setLabels] = useState<QuizSetLabel[]>([]);
  const [unlabeledCount, setUnlabeledCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Create label dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelDescription, setNewLabelDescription] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#3B82F6");

  // Edit label dialog
  const [editingLabel, setEditingLabel] = useState<QuizSetLabel | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("");

  // Label questions dialog
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [labelDialogLabel, setLabelDialogLabel] = useState<QuizSetLabel | null>(null);
  const isMobile = useIsMobile();
  const [labelQuestions, setLabelQuestions] = useState<Quizz[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionSearch, setQuestionSearch] = useState("");
  const [labelQuestionPage, setLabelQuestionPage] = useState(1);
  const labelQuestionItemsPerPage = 10;
  const debouncedQuestionSearch = useDebounce(questionSearch, 300);

  // Description expand/collapse
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [overflowingIds, setOverflowingIds] = useState<Set<string>>(new Set());
  const descElementsRef = useRef(new Map<string, HTMLParagraphElement>());

  const setDescRef = useCallback((id: string) => (el: HTMLParagraphElement | null) => {
    if (el) {
      descElementsRef.current.set(id, el);
    } else {
      descElementsRef.current.delete(id);
    }
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Measure which descriptions overflow their 3-line clamp
  // Detached div timing: we need setTimeout to allow browser to paint + compute layout
  useEffect(() => {
    // First RAF ensures initial render is done
    const rafId = requestAnimationFrame(() => {
      // Then setTimeout gives the browser time to paint and resolve styles
      const timerId = window.setTimeout(() => {
        const overflown = new Set<string>();
        labels.forEach((label) => {
          if (!label.description) return;
          const visibleEl = descElementsRef.current.get(label.id);
          if (!visibleEl) return;

          // Cloned styles from visible element (no line-clamp so it shows all content)
          const cs = getComputedStyle(visibleEl);
          const measure = document.createElement("div");
          measure.style.cssText = [
            "position:fixed",
            "visibility:hidden",
            "pointer-events:none",
            "z-index:-1",
            `width:${visibleEl.clientWidth}px`,
            `font-size:${cs.fontSize}`,
            `font-family:${cs.fontFamily}`,
            `line-height:${cs.lineHeight}`,
            `padding:${cs.padding}`,
            "box-sizing:border-box",
            "white-space:normal",
            "word-break:break-word",
            "overflow:visible",
          ].join(";");
          measure.textContent = label.description;
          document.body.appendChild(measure);

          const unclampedHeight = measure.offsetHeight;
          document.body.removeChild(measure);

          // If unclamped text is taller than the visible clamped element, overflow
          if (unclampedHeight > visibleEl.clientHeight + 2) {
            overflown.add(label.id);
          }
        });
        setOverflowingIds(overflown);
      }, 100);
      return () => {
        window.clearTimeout(timerId);
      };
    });
    return () => cancelAnimationFrame(rafId);
  }, [labels]);

  // Load labels
  const loadLabels = useCallback(async () => {
    try {
      const response = await getQuizSetLabelsApi(quizSetId);
      setLabels(response.labels);
      setUnlabeledCount(response.unlabeledCount);
    } catch (error) {
      console.error("Failed to load labels:", error);
      toast.error("Không thể tải danh sách nhãn");
    } finally {
      setLoading(false);
    }
  }, [quizSetId]);

  useEffect(() => {
    loadLabels();
  }, [loadLabels]);

  // Cache key generator for questions by label
  const getLabelQuestionsCacheKey = (labelId: string) =>
    storeCache.createKey("questions-by-label", { quizSetId, labelId });

  // Invalidate cache for a specific label
  const invalidateLabelCache = (labelId: string) => {
    const cacheKey = getLabelQuestionsCacheKey(labelId);
    storeCache.invalidate(cacheKey);
  };

  const loadLabelQuestions = useCallback(
    async (label: QuizSetLabel, page = 1, forceRefresh = false) => {
      const cacheKey = getLabelQuestionsCacheKey(label.id);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = storeCache.get<Quizz[]>(cacheKey);
        if (cached !== null) {
          setLabelQuestions(cached);
          setLabelDialogLabel(label);
          setLabelQuestionPage(page);
          setLabelDialogOpen(true);
          setQuestionSearch("");
          return;
        }
      }

      setLoadingQuestions(true);
      setLabelDialogLabel(label);
      setLabelQuestionPage(page);
      setLabelDialogOpen(true);
      setQuestionSearch("");
      try {
        const response = await getQuestionsByLabelApi(quizSetId, label.id, page, labelQuestionItemsPerPage * 5);
        setLabelQuestions(response.questions);
        // Cache the result
        storeCache.set(cacheKey, response.questions);
      } catch (error) {
        console.error("Failed to load questions:", error);
        toast.error("Không thể tải câu hỏi");
      } finally {
        setLoadingQuestions(false);
      }
    },
    [quizSetId],
  );

  const filteredLabelQuestions = debouncedQuestionSearch
    ? labelQuestions.filter((q) => {
      const searchLower = debouncedQuestionSearch.toLowerCase();
      const textContent = q.question.replace(/<[^>]+>/g, "").toLowerCase();
      return textContent.includes(searchLower);
    })
    : labelQuestions;

  const totalLabelPages = Math.ceil(filteredLabelQuestions.length / labelQuestionItemsPerPage);
  const paginatedLabelQuestions = filteredLabelQuestions.slice(
    (labelQuestionPage - 1) * labelQuestionItemsPerPage,
    labelQuestionPage * labelQuestionItemsPerPage,
  );

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;

    try {
      const response = await createLabelApi(quizSetId, {
        name: newLabelName.trim(),
        description: newLabelDescription.trim() || undefined,
        color: newLabelColor,
      });

      toast.success("Tạo nhãn thành công");
      setLabels((prev) => [...prev, response.label]);
      setShowCreateDialog(false);
      setNewLabelName("");
      setNewLabelDescription("");
      setNewLabelColor("#3B82F6");

      invalidateCache();
      onLabelChange?.("create", response.label.id);
    } catch (error) {
      console.error("Failed to create label:", error);
      toast.error("Tạo nhãn thất bại");
    }
  };

  const handleEditLabel = async () => {
    if (!editingLabel || !editName.trim()) return;

    try {
      const response = await updateLabelApi(quizSetId, editingLabel.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        color: editColor || null,
      });

      toast.success("Cập nhật nhãn thành công");
      setLabels((prev) =>
        prev.map((l) => (l.id === editingLabel.id ? response.label : l)),
      );
      setEditingLabel(null);

      invalidateCache();
      invalidateLabelCache(editingLabel.id);
      onLabelChange?.("update", editingLabel.id);
    } catch (error) {
      console.error("Failed to update label:", error);
      toast.error("Cập nhật nhãn thất bại");
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    if (
      !confirm(
        "Bạn có chắc chắn muốn xóa nhãn này? Các câu hỏi sẽ không có nhãn.",
      )
    )
      return;

    try {
      await deleteLabelApi(quizSetId, labelId);
      toast.success("Xóa nhãn thành công");
      setLabels((prev) => prev.filter((l) => l.id !== labelId));

      invalidateCache();
      invalidateLabelCache(labelId);
      onLabelChange?.("delete", labelId);
    } catch (error) {
      console.error("Failed to delete label:", error);
      toast.error("Xóa nhãn thất bại");
    }
  };

  const startEdit = (label: QuizSetLabel) => {
    setEditingLabel(label);
    setEditName(label.name);
    setEditDescription(label.description || "");
    setEditColor(label.color || "");
  };

  if (loading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Quản lý nhãn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Đang tải...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="!mb-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Quản lý nhãn
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Tạo nhãn
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tạo nhãn mới</DialogTitle>
                <DialogDescription>
                  Tạo nhãn để tổ chức câu hỏi theo chủ đề
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="label-name">Tên nhãn</Label>
                  <Input
                    id="label-name"
                    placeholder="VD: Chương 1, Đại số"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="label-description">Mô tả (tùy chọn)</Label>
                  <Textarea
                    id="label-description"
                    placeholder="Mô tả về nhãn này"
                    value={newLabelDescription}
                    onChange={(e) => setNewLabelDescription(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Màu sắc</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {LABEL_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewLabelColor(color)}
                        className={cn(
                          "w-8 h-8 rounded-full border-2",
                          newLabelColor === color
                            ? "border-foreground"
                            : "border-transparent",
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Hủy
                </Button>
                <Button
                  onClick={handleCreateLabel}
                  disabled={!newLabelName.trim()}
                >
                  Tạo nhãn
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Tổng quan</TabsTrigger>
            <TabsTrigger value="unlabeled" disabled={unlabeledCount === 0}>
              Chưa gán nhãn ({unlabeledCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            {labels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Chưa có nhãn nào</p>
                <p className="text-sm mt-2">
                  Tạo nhãn để tổ chức câu hỏi theo chủ đề
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {labels.map((label) => (
                  <Card key={label.id} className="hover:shadow-md transition-shadow [&_.ant-card-body]:!p-0" style={{ padding: "0" }}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => loadLabelQuestions(label)}
                        >
                          {label.color && (
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: label.color }}
                            />
                          )}
                          <span className="font-medium">{label.name}</span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => startEdit(label)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteLabel(label.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p
                        ref={setDescRef(label.id)}
                        className={cn(
                          "text-sm text-muted-foreground w-full whitespace-normal break-words",
                          !expandedIds.has(label.id) && "line-clamp-3",
                          overflowingIds.has(label.id) ? "mb-0" : "mb-2",
                        )}
                        style={
                          !expandedIds.has(label.id)
                            ? {
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                wordBreak: "break-word",
                              }
                            : undefined
                        }
                        onClick={() => loadLabelQuestions(label)}
                      >
                        {label.description || "Không có mô tả"}
                      </p>
                      {overflowingIds.has(label.id) && (
                        <button
                          className="block text-xs text-muted-foreground hover:text-foreground mb-2 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(label.id);
                          }}
                        >
                          {expandedIds.has(label.id) ? "Thu gọn" : "Xem thêm"}
                        </button>
                      )}
                      <Badge
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => loadLabelQuestions(label)}
                      >
                        {label.questionCount || 0} câu hỏi
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="unlabeled" className="mt-4">
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Câu hỏi chưa gán nhãn</p>
              <p className="text-sm mt-2">
                Chọn một nhãn từ danh sách để xem câu hỏi
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Label Questions Dialog */}
      <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
        <DialogContent
          modalWidth={isMobile ? "90vw" : 960}
          bodyStyle={{
            maxHeight: isMobile ? "80vh" : "70vh",
            overflow: "auto",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {labelDialogLabel?.color && (
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: labelDialogLabel.color }}
                />
              )}
              {labelDialogLabel?.name}
            </DialogTitle>
            <DialogDescription>
              {filteredLabelQuestions.length} câu hỏi
              {totalLabelPages > 1 && ` (trang ${labelQuestionPage}/${totalLabelPages})`}
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm câu hỏi..."
              value={questionSearch}
              onChange={(e) => setQuestionSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {questionSearch && (
              <button
                onClick={() => setQuestionSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="space-y-3">
            {loadingQuestions ? (
              <div className="text-center py-8 text-muted-foreground">
                Đang tải...
              </div>
            ) : filteredLabelQuestions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {debouncedQuestionSearch
                  ? "Không tìm thấy câu hỏi phù hợp"
                  : "Không có câu hỏi nào trong nhãn này"}
              </div>
            ) : (
              paginatedLabelQuestions.map((question, index) => {
                const plainText = question.question.replace(/<[^>]+>/g, "");

                return (
                  <div
                    key={question.id}
                    className="rounded-[8px] border border-hairline p-3 space-y-2 mt-4"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-coral/15 font-mono text-[11px] font-semibold text-coral">
                        {index + 1}
                      </span>
                      <div className="text-[13px] leading-[1.55] flex-1">
                        {debouncedQuestionSearch ? (
                          <div>{highlightMatches(plainText, debouncedQuestionSearch)}</div>
                        ) : (
                          <RichTextViewer content={question.question} />
                        )}
                      </div>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {question.options.map((option, optIndex) => {
                        const isCorrect = isCorrectAnswer(
                          question.answer,
                          optIndex,
                          question.options,
                        );
                        return (
                          <div
                            key={optIndex}
                            className={cn(
                              "flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px]",
                              isCorrect
                                ? "border-coral/40 bg-coral/10 text-ink"
                                : "border-hairline text-muted-foreground",
                            )}
                          >
                            <span className="font-mono text-[10px] shrink-0">
                              {String.fromCharCode(65 + optIndex)}.
                            </span>
                            <span className="flex-1 min-w-0 mt-3">
                              <RichTextViewer
                                content={quizOptionToText(option).replace(
                                  /^[A-D][\.\)\:\s]+/i,
                                  "",
                                )}
                              />
                            </span>
                            {isCorrect && (
                              <span className="text-[10px] text-coral font-medium shrink-0">
                                ✓
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}

            {/* Pagination */}
            {totalLabelPages > 1 && (
              <div className="flex items-center justify-between border-t pt-3 mt-2">
                <p className="text-xs text-muted-foreground">
                  {(labelQuestionPage - 1) * labelQuestionItemsPerPage + 1}–{Math.min(labelQuestionPage * labelQuestionItemsPerPage, filteredLabelQuestions.length)} / {filteredLabelQuestions.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setLabelQuestionPage((p) => Math.max(1, p - 1))}
                    disabled={labelQuestionPage === 1}
                  >
                    ‹
                  </Button>
                  {Array.from({ length: Math.min(5, totalLabelPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalLabelPages <= 5) pageNum = i + 1;
                    else if (labelQuestionPage <= 3) pageNum = i + 1;
                    else if (labelQuestionPage >= totalLabelPages - 2) pageNum = totalLabelPages - 4 + i;
                    else pageNum = labelQuestionPage - 2 + i;
                    return (
                      <Button
                        key={pageNum}
                        variant={labelQuestionPage === pageNum ? "default" : "outline"}
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setLabelQuestionPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setLabelQuestionPage((p) => Math.min(totalLabelPages, p + 1))}
                    disabled={labelQuestionPage === totalLabelPages}
                  >
                    ›
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Label Dialog */}
      {editingLabel && (
        <Dialog
          open={!!editingLabel}
          onOpenChange={() => setEditingLabel(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Chỉnh sửa nhãn</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Tên nhãn</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Mô tả</Label>
                <Textarea
                  id="edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>
              <div>
                <Label>Màu sắc</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {LABEL_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEditColor(color)}
                      className={cn(
                        "w-8 h-8 rounded-full border-2",
                        editColor === color
                          ? "border-foreground"
                          : "border-transparent",
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingLabel(null)}>
                Hủy
              </Button>
              <Button onClick={handleEditLabel} disabled={!editName.trim()}>
                Lưu thay đổi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
