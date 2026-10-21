import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  Share2,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "@/components/antd/toast";
import { Badge } from "@/components/antd/badge";
import { Button } from "@/components/antd/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/antd/breadcrumb";
import { Card, CardContent } from "@/components/antd/card";
import { DeleteConfirmDialog } from "@/components/organisms/DeleteConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/antd/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/antd/dropdown-menu";
import { ExamSessionFormModal } from "@/components/organisms/ExamSessionFormModal";
import { Skeleton } from "@/components/antd/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/antd/table";
import { ASSESS_TYPE } from "@/types/examSession";
import type { ExamSessionBasic } from "@/types/examRoom";
import { useExamRoomDetailStore } from "@/stores/useExamRoomDetailStore";
import { useExamRoomStore } from "@/stores/useExamRoomStore";

const PAGE_SIZE = 10;

export default function ManageExamRoomDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { currentExamRoom, fetchExamRoomById, loading } = useExamRoomStore();
  const {
    sessions,
    sessionsTotalPages,
    totalDistinctParticipants,
    loadingSessions,
    mutationLoading,
    fetchSessions,
    createSession,
    updateSession,
    deleteSession,
    reset,
  } = useExamRoomDetailStore();

  const [sessionsPage, setSessionsPage] = useState(1);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingSession, setEditingSession] = useState<ExamSessionBasic | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchExamRoomById(id);
    }

    return () => {
      reset();
    };
  }, [id, fetchExamRoomById, reset]);

  useEffect(() => {
    if (id) {
      fetchSessions(id, sessionsPage, PAGE_SIZE);
    }
  }, [id, sessionsPage, fetchSessions]);

  const stats = useMemo(() => {
    const now = new Date();
    const total = sessions.length;
    const upcoming = sessions.filter((s) => new Date(s.startTime) > now).length;
    const ongoing = sessions.filter((s) => {
      const start = new Date(s.startTime);
      const end = s.endTime ? new Date(s.endTime) : null;
      return start <= now && (!end || end > now);
    }).length;
    const completed = sessions.filter((s) => {
      const end = s.endTime ? new Date(s.endTime) : null;
      return end && end <= now;
    }).length;
    const totalAttempts = sessions.reduce((sum, s) => sum + (s._count?.examAttempts || 0), 0);

    return {
      total,
      upcoming,
      ongoing,
      completed,
      totalAttempts,
      totalParticipants: totalDistinctParticipants,
    };
  }, [sessions, totalDistinctParticipants]);

  const getStatusBadge = (startTime: string, endTime: string) => {
    const now = new Date();
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : null;

    if (now < start) return <Badge variant="secondary">Sắp diễn ra</Badge>;
    if ((end && now < end) || !end) return <Badge variant="default">Đang diễn ra</Badge>;
    return <Badge variant="outline">Đã kết thúc</Badge>;
  };

  const handleCopyLink = () => {
    if (!selectedSessionId) return;
    const link = `${window.location.origin}/exam-session/${selectedSessionId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Đã sao chép link!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFormSubmit = async (data: {
    startTime: string;
    endTime?: string;
    assessType: ASSESS_TYPE;
    accessCode?: string | null;
    whitelist?: string[];
    allowRetake: boolean;
    maxAttempts: number;
    showAnswersAfterSubmit?: boolean;
    passingScore?: number;
    questionCount?: number | null;
    questionSelectionMode?: number;
    labelQuestionConfig?: any[] | null;
    shuffleQuestions?: boolean;
  }) => {
    let success = false;

    if (formMode === "create") {
      success = await createSession({ examRoomId: id, ...data });
    } else if (editingSession) {
      success = await updateSession(editingSession.id, data);
    }

    return success;
  };

  const renderPagination = () => {
    if (sessionsTotalPages <= 1) return null;

    return (
      <div className="mt-4 flex items-center justify-between rounded-b-lg border-t border-hairline bg-surface-soft px-4 py-4">
        <span className="text-sm text-muted-foreground">Trang {sessionsPage} / {sessionsTotalPages}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSessionsPage((prev) => prev - 1)}
            disabled={sessionsPage === 1}
            className="h-8 border-hairline">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSessionsPage((prev) => prev + 1)}
            disabled={sessionsPage === sessionsTotalPages}
            className="h-8 border-hairline">
            Sau
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!currentExamRoom) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">Không tìm thấy phòng thi</p>
            <Button variant="link" onClick={() => navigate("/k/manage-exam-room")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Quay lại danh sách
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
              <Breadcrumb className="mb-3">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/k/manage-exam-room">Quản lý Phòng thi</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{currentExamRoom.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <h1 className="font-display text-2xl tracking-tight text-ink">{currentExamRoom.title}</h1>
              <p className="text-xs text-muted-foreground md:text-sm">Chi tiết phòng thi và các phiên thi liên quan</p>
            </div>
            <Button onClick={() => { setFormMode("create"); setEditingSession(null); setFormModalOpen(true); }} size="lg">
              <Plus className="mr-2 h-4 w-4" />
              Tạo phiên thi
            </Button>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-hairline bg-canvas p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">Tổng phiên thi</p>
                <p className="mt-2 text-3xl font-bold text-ink">{stats.total}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-coral/10 text-coral">
                <Calendar className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">Đang diễn ra</p>
                <p className="mt-2 text-3xl font-bold text-ink">{stats.ongoing}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/10 text-success">
                <PlayCircle className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">Thí sinh tham gia</p>
                <p className="mt-2 text-3xl font-bold text-ink">{stats.totalParticipants}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-teal/10 text-accent-teal">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">Lượt làm bài</p>
                <p className="mt-2 text-3xl font-bold text-ink">{stats.totalAttempts}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-amber/10 text-accent-amber">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-lg border border-hairline bg-canvas p-4">
          <div className="mb-4 border-b border-hairline pb-4">
            <h2 className="text-lg font-medium text-ink">Thông tin phòng thi</h2>
          </div>
          <div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex items-start gap-3"><div className="rounded-lg bg-coral/10 p-2"><Calendar className="h-5 w-5 text-coral" /></div><div><p className="text-sm font-medium text-ink">Bộ đề</p><p className="text-sm text-muted-foreground">{currentExamRoom.quizSet?.title || "Chưa có bộ đề"}</p></div></div>
              <div className="flex items-start gap-3"><div className="rounded-lg bg-accent-teal/10 p-2"><Users className="h-5 w-5 text-accent-teal" /></div><div><p className="text-sm font-medium text-ink">Người tổ chức</p><p className="text-sm text-muted-foreground">{currentExamRoom.host?.name || currentExamRoom.host?.username}</p></div></div>
              <div className="flex items-start gap-3"><div className="rounded-lg bg-accent-amber/10 p-2"><Clock className="h-5 w-5 text-accent-amber" /></div><div><p className="text-sm font-medium text-ink">Ngày tạo</p><p className="text-sm text-muted-foreground">{format(new Date(currentExamRoom.createdAt), "dd/MM/yyyy")}</p></div></div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-hairline bg-canvas p-4">
          <div className="mb-4 border-b border-hairline pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-medium text-ink">Danh sách phiên thi</h2>
                <p className="text-sm text-muted-foreground mt-1">Quản lý các phiên thi trong phòng</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-hairline text-coral"><Timer className="mr-1 h-3 w-3" />{stats.upcoming} sắp tới</Badge>
                <Badge variant="outline" className="border-hairline text-success"><PlayCircle className="mr-1 h-3 w-3" />{stats.ongoing} đang thi</Badge>
                <Badge variant="outline" className="border-hairline text-muted-foreground"><CheckCircle2 className="mr-1 h-3 w-3" />{stats.completed} đã kết thúc</Badge>
              </div>
            </div>
          </div>
          <div>
            {loadingSessions ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Calendar className="mx-auto mb-4 h-16 w-16 opacity-50" />
                <p className="mb-2 text-lg font-medium text-ink">Chưa có phiên thi nào</p>
                <p className="mb-4 text-sm">Tạo phiên thi đầu tiên để bắt đầu tổ chức bài kiểm tra</p>
                <Button onClick={() => { setFormMode("create"); setEditingSession(null); setFormModalOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tạo phiên thi đầu tiên
                </Button>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-lg border border-hairline">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-hairline bg-surface-soft/70 hover:bg-transparent">
                        <TableHead className="w-[140px] text-muted-foreground font-medium">Trạng thái</TableHead>
                        <TableHead className="text-muted-foreground font-medium">Thời gian bắt đầu</TableHead>
                        <TableHead className="text-muted-foreground font-medium">Thời gian kết thúc</TableHead>
                        <TableHead className="text-center text-muted-foreground font-medium"><Users className="mr-1 inline h-4 w-4" />Thí sinh</TableHead>
                        <TableHead className="text-center text-muted-foreground font-medium"><CheckCircle2 className="mr-1 inline h-4 w-4" />Bài làm</TableHead>
                        <TableHead className="w-[100px] text-right text-muted-foreground font-medium">Hành động</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((session) => (
                        <TableRow key={session.id} className="border-hairline hover:bg-surface-soft">
                          <TableCell>{getStatusBadge(session.startTime, session.endTime || "")}</TableCell>
                          <TableCell className="font-medium text-ink">{format(new Date(session.startTime), "dd/MM/yyyy HH:mm")}</TableCell>
                          <TableCell>{session.endTime ? format(new Date(session.endTime), "dd/MM/yyyy HH:mm") : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-center"><Badge variant="outline" className="border-hairline">{session.distinctUserCount || 0}</Badge></TableCell>
                          <TableCell className="text-center"><Badge variant="outline" className="border-hairline">{session._count?.examAttempts || 0}</Badge></TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setSelectedSessionId(session.id); setShareDialogOpen(true); setCopied(false); }}><Share2 className="mr-2 h-4 w-4" />Chia sẻ</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/k/manage-exam-room/${id}/session/${session.id}`)}><BarChart3 className="mr-2 h-4 w-4" />Xem thống kê</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setFormMode("edit"); setEditingSession(session); setFormModalOpen(true); }}><Pencil className="mr-2 h-4 w-4" />Chỉnh sửa</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setDeletingSessionId(session.id); setDeleteDialogOpen(true); }} className="text-red-600 focus:text-red-600"><Trash2 className="mr-2 h-4 w-4" />Xóa</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {renderPagination()}
              </>
            )}
          </div>
        </div>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md border-hairline bg-canvas">
          <DialogHeader><DialogTitle className="text-ink">Chia sẻ phiên thi</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={selectedSessionId ? `${window.location.origin}/exam-session/${selectedSessionId}` : ""}
                className="flex-1 rounded-md border border-hairline bg-surface-soft px-3 py-2 text-sm text-ink"
              />
              <Button variant="outline" size="sm" className="border-hairline" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Chia sẻ link này để mọi người có thể truy cập phiên thi.</p>
          </div>
        </DialogContent>
      </Dialog>

      <ExamSessionFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        mode={formMode}
        examRoomId={id}
        session={editingSession}
        onSubmit={handleFormSubmit}
        isLoading={mutationLoading}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Xóa phiên thi"
        description="Bạn có chắc chắn muốn xóa phiên thi này? Tất cả dữ liệu liên quan sẽ bị xóa vĩnh viễn."
        isLoading={mutationLoading}
        onConfirm={async () => {
          if (!deletingSessionId) return;
          const success = await deleteSession(deletingSessionId, id);
          if (success) {
            setDeleteDialogOpen(false);
            setDeletingSessionId(null);
            fetchSessions(id, sessionsPage, PAGE_SIZE, { forceRefresh: true });
          }
        }}
      />
      </div>
    </div>
  );
}
