import { memo } from "react";
import { Button } from "@/components/antd/button";
import { Plus } from "lucide-react";

interface ExamManagementHeaderProps {
  onCreateExam: () => void;
}

const ExamManagementHeaderComponent = ({
  onCreateExam,
}: ExamManagementHeaderProps) => {
  return (
    <div className="flex items-start justify-between mb-8 mt-4">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink">Quản lý đề thi</h1>
        <p className="text-xs text-muted-foreground md:text-sm">
          Tạo, chỉnh sửa và quản lý các đề thi và câu hỏi của bạn
        </p>
      </div>
      <Button onClick={onCreateExam}>
        <Plus className="h-4 w-4 mr-2" />
        Tạo đề thi
      </Button>
    </div>
  );
};

ExamManagementHeaderComponent.displayName = "ExamManagementHeader";

export const ExamManagementHeader = memo(ExamManagementHeaderComponent);
