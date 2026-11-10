"use client";

import { Undo2, X } from "lucide-react";
import { Label } from "@/components/antd/label";
import type { SharingPerson } from "@/lib/quiz-practice/sharing-types";

interface CodeGrantedListProps {
  users: SharingPerson[];
  /** Ids the teacher marked for removal (applied on save). */
  removedIds: string[];
  onToggleRemove: (id: string) => void;
}

/** People who opened the set with the current code; removing one revokes it on save. */
export function CodeGrantedList({ users, removedIds, onToggleRemove }: CodeGrantedListProps) {
  if (users.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label>Đã mở bằng mã ({users.length})</Label>
      <ul className="max-h-36 space-y-1 overflow-auto">
        {users.map((u) => {
          const removed = removedIds.includes(u.id);
          return (
            <li key={u.id} className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-sm">
              <span className={`truncate ${removed ? "text-muted-foreground line-through" : ""}`}>
                {u.name || u.username} <span className="text-xs text-muted-foreground">@{u.username}</span>
              </span>
              <button
                onClick={() => onToggleRemove(u.id)}
                className="ml-2 text-muted-foreground transition-colors hover:text-destructive"
                aria-label={removed ? "Hoàn tác" : `Gỡ quyền của ${u.name || u.username}`}
              >
                {removed ? <Undo2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
