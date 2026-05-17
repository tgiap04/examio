/* eslint-disable react-dom/no-dangerously-set-innerhtml */
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { Label } from "@/components/antd/label";
import { Avatar, AvatarImage } from "@/components/antd/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/antd/dialog";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Lock,
  Volume2,
  VolumeX,
  Home,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  checkFlashcardSetAccess,
  getFlashcardSetPublicInfo,
  getFlashcardSetForStudy,
} from "@/apis/flashcardSetApi";
import type {
  FlashcardSetPublicInfo,
  AccessCheckResult,
  Flashcard,
} from "@/types/flashcardSet";

const SOUND_EFFECTS = {
  flip: "https://cdn.pixabay.com/audio/2022/03/10/audio_71e4fc8a6e.mp3",
  next: "https://cdn.pixabay.com/audio/2025/11/06/audio_69d4c569ef.mp3",
  prev: "https://cdn.pixabay.com/audio/2025/11/06/audio_69d4c569ef.mp3",
};

export default function FlashcardStudyPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [accessCheckResult, setAccessCheckResult] =
    useState<AccessCheckResult | null>(null);
  const [publicInfo, setPublicInfo] = useState<FlashcardSetPublicInfo | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);

  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(false);

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [flashcardSetTitle, setFlashcardSetTitle] = useState("");
  const [flashcardSetDescription, setFlashcardSetDescription] = useState("");
  const [viewCount, setViewCount] = useState(0);
  const [creator, setCreator] = useState<{
    name: string;
    avatar: string | null;
    username: string;
  } | null>(null);

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studiedCards, setStudiedCards] = useState<Set<string>>(() => new Set());
  const [settings, setSettings] = useState({ soundEffects: false });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const activeButton = container.children[currentCardIndex] as HTMLElement;
      if (activeButton) {
        const containerRect = container.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        const scrollLeft =
          container.scrollLeft +
          (buttonRect.left - containerRect.left) -
          container.offsetWidth / 2 +
          activeButton.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
  }, [currentCardIndex]);

  const playSound = useCallback(
    (sound: keyof typeof SOUND_EFFECTS) => {
      if (settings.soundEffects && audioRef.current) {
        audioRef.current.src = SOUND_EFFECTS[sound];
        audioRef.current.play().catch(() => {});
      }
    },
    [settings.soundEffects],
  );

  const loadFlashcards = useCallback(async (flashcardId: string, code?: string) => {
    setIsLoadingFlashcards(true);
    try {
      const data = await getFlashcardSetForStudy(flashcardId, code);
      setFlashcards(data.flashCards || []);
      setFlashcardSetTitle(data.title);
      setFlashcardSetDescription(data.description || "");
      setViewCount(data.viewCount);
      setCreator(data.creator);
      setShowAccessModal(false);
      setAccessCheckResult({ hasAccess: true, requiresCode: false, accessType: "public" });
    } catch (error) {
      console.error("Error loading flashcards:", error);
      throw error;
    } finally {
      setIsLoadingFlashcards(false);
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setIsCheckingAccess(false);
      return;
    }

    const checkAccess = async () => {
      setIsCheckingAccess(true);
      try {
        const result = await checkFlashcardSetAccess(id);
        setAccessCheckResult(result);
        if (result.hasAccess) {
          await loadFlashcards(id);
        } else if (result.requiresCode) {
          const info = await getFlashcardSetPublicInfo(id);
          setPublicInfo(info);
          setShowAccessModal(true);
        } else {
          const info = await getFlashcardSetPublicInfo(id);
          setPublicInfo(info);
        }
      } catch {
        try {
          const info = await getFlashcardSetPublicInfo(id);
          setPublicInfo(info);
        } catch { /* set doesn't exist */ }
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkAccess();
  }, [id, loadFlashcards]);

  const handleVerifyCode = async () => {
    if (!accessCode.trim()) {
      setAccessError("Vui lòng nhập mã truy cập");
      return;
    }
    setIsVerifying(true);
    setAccessError("");
    try {
      await loadFlashcards(id, accessCode);
    } catch (error: any) {
      setAccessError(error?.message || "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    playSound("flip");
  };

  const handlePrevious = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsFlipped(false);
      playSound("prev");
    }
  };

  const handleNext = () => {
    if (currentCardIndex < flashcards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsFlipped(false);
      playSound("next");
      const currentCard = flashcards[currentCardIndex];
      if (currentCard) {
        setStudiedCards((prev) => new Set([...prev, currentCard.id]));
      }
    }
  };

  const handleCardClick = (index: number) => {
    setCurrentCardIndex(index);
    setIsFlipped(false);
    playSound("next");
  };

  // Loading / access states
  if (isCheckingAccess) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-canvas">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-hairline border-t-coral" />
          <p className="text-sm text-muted-foreground">Đang kiểm tra quyền truy cập...</p>
        </div>
      </div>
    );
  }

  if (accessCheckResult && !accessCheckResult.hasAccess && !accessCheckResult.requiresCode) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-canvas">
        <div className="max-w-sm px-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-card">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-2xl tracking-tight text-ink">Không có quyền truy cập</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Bộ flashcard này là riêng tư hoặc bạn chưa được thêm vào whitelist.
          </p>
          {publicInfo && (
            <div className="mt-4 rounded-lg border border-hairline bg-surface-soft p-4">
              <p className="font-medium text-ink">{publicInfo.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tạo bởi {publicInfo.creator.name || publicInfo.creator.username}
              </p>
            </div>
          )}
          <Button onClick={() => navigate("/")} className="mt-6">
            <Home className="mr-2 h-4 w-4" />
            Về trang chủ
          </Button>
        </div>
      </div>
    );
  }

  if (showAccessModal) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-canvas">
        <Dialog open={showAccessModal} onOpenChange={setShowAccessModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-coral" />
                Yêu cầu mã truy cập
              </DialogTitle>
              <DialogDescription>
                Bộ flashcard này yêu cầu mã truy cập để xem
              </DialogDescription>
            </DialogHeader>
            {publicInfo && (
              <div className="rounded-lg border border-hairline bg-surface-soft p-4 text-center">
                <p className="font-medium text-ink">{publicInfo.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tạo bởi {publicInfo.creator.name || publicInfo.creator.username}
                </p>
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="access-code">Mã truy cập (6 ký tự)</Label>
                <Input
                  id="access-code"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                  placeholder="XXXXXX"
                  maxLength={6}
                  className="text-center font-mono text-lg tracking-widest"
                />
                {accessError && <p className="text-sm text-error">{accessError}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleVerifyCode} disabled={isVerifying}>
                {isVerifying ? "Đang xác nhận..." : "Xác nhận"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (isLoadingFlashcards) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-canvas">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-hairline border-t-coral" />
          <p className="text-sm text-muted-foreground">Đang tải bộ flashcard...</p>
        </div>
      </div>
    );
  }

  if (!id || flashcards.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-canvas">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-card">
            <X className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-2xl tracking-tight text-ink">Không có thẻ</h1>
          <p className="mt-2 text-sm text-muted-foreground">Bộ flashcard này chưa có thẻ nào</p>
        </div>
      </div>
    );
  }

  const currentCard = flashcards[currentCardIndex];
  const totalCards = flashcards.length;
  const progress = Math.round(((studiedCards.size) / totalCards) * 100);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-canvas">
      <audio ref={audioRef} />

      {/* Header */}
      <header className="z-10 border-b border-hairline bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/k")}
              className="grid h-9 w-9 place-items-center rounded-lg border border-hairline text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink"
              aria-label="Về trang chủ"
            >
              <Home className="h-4 w-4" />
            </button>
            <h1 className="min-w-0 truncate font-body text-sm font-medium text-ink sm:text-base">
              {flashcardSetTitle}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {creator && (
              <div className="hidden items-center gap-2 rounded-lg border-none border-hairline bg-surface-soft px-3 py-1.5 sm:flex">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={creator.avatar || "/avt-default.webp"} />
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-[10px] leading-none text-muted-foreground">Tác giả</span>
                  <span className="text-xs font-medium text-ink">
                    {creator.name || creator.username}
                  </span>
                </div>
              </div>
            )}

            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <Eye className="h-3.5 w-3.5" />
              {viewCount.toLocaleString()}
            </span>
            <button
              onClick={() => setSettings((prev) => ({ ...prev, soundEffects: !prev.soundEffects }))}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-lg border border-hairline transition-colors",
                settings.soundEffects
                  ? "bg-coral/10 text-coral"
                  : "text-muted-foreground hover:bg-surface-card hover:text-ink"
              )}
              aria-label={settings.soundEffects ? "Tắt âm thanh" : "Bật âm thanh"}
            >
              {settings.soundEffects ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-hairline">
          <div
            className="h-full bg-coral transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Card area */}
      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-2xl">
          {/* Flip card */}
          <div
            className="relative cursor-pointer"
            style={{ perspective: "1200px" }}
            onClick={handleFlip}
          >
            <div
              className="relative w-full transition-transform duration-500 ease-out"
              style={{
                transformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* Front */}
              <div
                className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-hairline bg-canvas p-8 shadow-[0_1px_3px_rgba(20,20,19,0.08)] sm:min-h-[380px] sm:p-12"
                style={{ backfaceVisibility: "hidden" }}
              >
                <span className="mb-4 rounded-pill bg-surface-card px-3 py-1 text-xs font-medium text-muted-foreground">
                  Câu hỏi
                </span>
                <div
                  className="prose max-w-none text-center text-lg text-ink sm:text-xl"
                  dangerouslySetInnerHTML={{ __html: currentCard?.question || "" }}
                />
                <div className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <RotateCcw className="h-3 w-3" />
                  Nhấp để lật thẻ
                </div>
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-coral/20 bg-surface-soft p-8 shadow-[0_1px_3px_rgba(20,20,19,0.08)] sm:min-h-[380px] sm:p-12"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <span className="mb-4 rounded-pill bg-coral/10 px-3 py-1 text-xs font-medium text-coral">
                  Câu trả lời
                </span>
                <div
                  className="prose max-w-none text-center text-lg text-ink sm:text-xl"
                  dangerouslySetInnerHTML={{ __html: currentCard?.answer || "" }}
                />
                <div className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <RotateCcw className="h-3 w-3" />
                  Nhấp để quay lại
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer navigation */}
      <footer className="z-10 border-t border-hairline bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={currentCardIndex === 0}
            className="h-9"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Trước</span>
          </Button>

          <div className="flex items-center gap-3">
            <div
              ref={scrollContainerRef}
              className="hidden max-w-[240px] gap-1 overflow-x-auto scroll-smooth sm:flex"
              style={{ scrollbarWidth: "none" }}
            >
              {flashcards.map((card, index) => {
                const isStudied = studiedCards.has(card.id);
                const isCurrent = index === currentCardIndex;
                return (
                  <button
                    key={card.id}
                    onClick={() => handleCardClick(index)}
                    className={cn(
                      "h-8 w-8 shrink-0 rounded-md text-xs font-medium transition-colors",
                      isCurrent && "bg-coral text-on-primary",
                      isStudied && !isCurrent && "bg-surface-cream-strong text-ink",
                      !isStudied && !isCurrent && "bg-surface-soft text-muted-foreground hover:bg-surface-card",
                    )}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-ink">{currentCardIndex + 1}</span>
              {" / "}
              {totalCards}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentCardIndex === totalCards - 1}
            className="h-9"
          >
            <span className="hidden sm:inline">Sau</span>
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
