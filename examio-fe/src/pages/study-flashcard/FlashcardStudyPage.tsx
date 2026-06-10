/* eslint-disable react-dom/no-dangerously-set-innerhtml */
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
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
  Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setRedirectBackTarget } from "@/lib/authRedirect";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  checkFlashcardSetAccess,
  getFlashcardSetPublicInfo,
  getFlashcardSetForStudy,
} from "@/apis/flashcardSetApi";
import { getProgressApi, addStudiedCardApi } from "@/apis/flashcardStudyApi";
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
  const location = useLocation();
  const { isAuthenticated, initializing } = useAuthStore();

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

      try {
        const progress = await getProgressApi(flashcardId);
        if (progress.studiedCardIds && progress.studiedCardIds.length > 0) {
          setStudiedCards(new Set(progress.studiedCardIds));
        }
      } catch {
        // Progress not available
      }
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

    if (initializing) {
      return;
    }

    if (!isAuthenticated) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      setRedirectBackTarget(returnTo);
      navigate(`/login?from=${encodeURIComponent(returnTo)}`, { replace: true });
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
  }, [id, initializing, isAuthenticated, loadFlashcards, location, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrevious();
      else if (e.key === "ArrowRight") handleNext();
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleFlip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

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
      if (currentCard && !studiedCards.has(currentCard.id)) {
        setStudiedCards((prev) => new Set([...prev, currentCard.id]));
        addStudiedCardApi(id, currentCard.id).catch(() => {});
      }
    }
  };

  const handleShuffle = () => {
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setCurrentCardIndex(0);
    setIsFlipped(false);
  };

  // Loading state
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

  // No access (not in whitelist)
  if (accessCheckResult && !accessCheckResult.hasAccess && !accessCheckResult.requiresCode) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-canvas">
        <div className="max-w-sm px-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-card">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="font-display text-2xl tracking-tight text-ink">Không có quyền truy cập</h1>
          <p className="mt-2 text-sm text-body">
            Bộ flashcard này là riêng tư hoặc bạn chưa được thêm vào whitelist.
          </p>
          {publicInfo && (
            <div className="mt-4 rounded-lg border border-hairline bg-surface-card p-4">
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

  // Access code modal
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
              <div className="rounded-lg border border-hairline bg-surface-card p-4 text-center">
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

  // Loading flashcards
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

  // Empty state
  if (!id || flashcards.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-canvas">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-card">
            <X className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="font-display text-2xl tracking-tight text-ink">Không có thẻ</h1>
          <p className="mt-2 text-sm text-body">Bộ flashcard này chưa có thẻ nào</p>
        </div>
      </div>
    );
  }

  const currentCard = flashcards[currentCardIndex];
  const totalCards = flashcards.length;
  const progress = Math.round((studiedCards.size / totalCards) * 100);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-canvas">
      <audio ref={audioRef} />

      {/* Header — editorial minimal */}
      <header className="z-10 flex-shrink-0">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/k")}
              className="grid h-9 w-9 place-items-center rounded-md border border-hairline text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink"
              aria-label="Về trang chủ"
            >
              <Home className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg tracking-tight text-ink sm:text-xl">
                {flashcardSetTitle}
              </h1>
              {flashcardSetDescription && (
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  {flashcardSetDescription}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {creator && (
              <div className="hidden items-center gap-2 sm:flex">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={creator.avatar || "/avt-default.webp"} />
                </Avatar>
                <span className="text-xs text-muted-foreground">
                  {creator.name || creator.username}
                </span>
              </div>
            )}
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <Eye className="h-3.5 w-3.5" />
              {viewCount.toLocaleString()}
            </span>
            <button
              onClick={handleShuffle}
              className="grid h-9 w-9 place-items-center rounded-md border border-hairline text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink"
              aria-label="Xáo trộn"
              title="Xáo trộn thẻ"
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSettings((prev) => ({ ...prev, soundEffects: !prev.soundEffects }))}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-md border border-hairline transition-colors",
                settings.soundEffects
                  ? "border-coral/30 bg-coral/10 text-coral"
                  : "text-muted-foreground hover:bg-surface-card hover:text-ink"
              )}
              aria-label={settings.soundEffects ? "Tắt âm thanh" : "Bật âm thanh"}
            >
              {settings.soundEffects ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Progress bar — thin coral line */}
        <div className="h-[2px] bg-hairline-soft">
          <div
            className="h-full bg-coral transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Main card area */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl">
          {/* Card counter */}
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded-pill bg-surface-card px-3 py-1 text-xs font-medium text-muted-foreground">
              {currentCardIndex + 1} / {totalCards}
            </span>
            <span className="text-xs text-muted-foreground">
              {studiedCards.size} đã học · {progress}%
            </span>
          </div>

          {/* Flip card — editorial cream surface */}
          <div
            className="relative cursor-pointer select-none"
            style={{ perspective: "1200px" }}
            onClick={handleFlip}
          >
            <div
              className="relative w-full transition-transform duration-600 ease-out"
              style={{
                transformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* Front — cream card */}
              <div
                className="flex min-h-[340px] flex-col items-center justify-center rounded-lg border border-hairline bg-surface-card p-10 sm:min-h-[400px] sm:p-14"
                style={{ backfaceVisibility: "hidden" }}
              >
                <span className="mb-6 inline-flex items-center gap-1.5 rounded-pill bg-canvas px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Câu hỏi
                </span>
                <div
                  className="prose max-w-none text-center font-display text-xl leading-relaxed tracking-tight text-ink sm:text-2xl"
                  dangerouslySetInnerHTML={{ __html: currentCard?.question || "" }}
                />
                <div className="mt-auto pt-8 flex items-center gap-1.5 text-[11px] text-muted-soft">
                  <RotateCcw className="h-3 w-3" />
                  Nhấp hoặc Space để lật
                </div>
              </div>

              {/* Back — warm soft surface with coral accent */}
              <div
                className="absolute inset-0 flex min-h-[340px] flex-col items-center justify-center rounded-lg border border-coral/20 bg-surface-soft p-10 sm:min-h-[400px] sm:p-14"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <span className="mb-6 inline-flex items-center gap-1.5 rounded-pill bg-coral/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-coral">
                  Câu trả lời
                </span>
                <div
                  className="prose max-w-none text-center text-lg leading-relaxed text-ink sm:text-xl"
                  dangerouslySetInnerHTML={{ __html: currentCard?.answer || "" }}
                />
                <div className="mt-auto pt-8 flex items-center gap-1.5 text-[11px] text-muted-soft">
                  <RotateCcw className="h-3 w-3" />
                  Nhấp hoặc Space để quay lại
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer — navigation controls */}
      <footer className="z-10 flex-shrink-0 border-t border-hairline-soft">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={currentCardIndex === 0}
            className="h-10 gap-1.5 rounded-md border-hairline px-4"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Trước</span>
          </Button>

          {/* Card dots — minimal indicator */}
          <div className="flex items-center gap-1">
            {totalCards <= 20 ? (
              flashcards.map((card, index) => {
                const isStudied = studiedCards.has(card.id);
                const isCurrent = index === currentCardIndex;
                return (
                  <button
                    key={card.id}
                    onClick={() => {
                      setCurrentCardIndex(index);
                      setIsFlipped(false);
                    }}
                    className={cn(
                      "h-2 w-2 rounded-full transition-all duration-200",
                      isCurrent && "h-2.5 w-2.5 bg-coral",
                      isStudied && !isCurrent && "bg-coral/40",
                      !isStudied && !isCurrent && "bg-hairline hover:bg-muted-soft",
                    )}
                    aria-label={`Thẻ ${index + 1}`}
                  />
                );
              })
            ) : (
              <span className="text-sm text-muted-foreground">
                <span className="font-medium text-ink">{currentCardIndex + 1}</span>
                {" / "}
                {totalCards}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentCardIndex === totalCards - 1}
            className="h-10 gap-1.5 rounded-md border-hairline px-4"
          >
            <span className="hidden sm:inline">Sau</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
