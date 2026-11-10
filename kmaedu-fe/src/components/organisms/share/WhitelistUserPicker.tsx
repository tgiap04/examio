"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/antd/input";
import { Label } from "@/components/antd/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/antd/avatar";
import { useDebounce } from "@/hooks/useDebounce";
import type { SharingPerson, SharingSearchUser } from "@/lib/quiz-practice/sharing-types";
import {
  addPerson,
  removePerson,
  visibleWhitelist,
  type WhitelistChange,
} from "./sharing-delta";

const MIN_QUERY = 3;

interface WhitelistUserPickerProps {
  /** The whitelist as saved on the server. */
  saved: SharingPerson[];
  change: WhitelistChange;
  /** Emits the new pending change (`added` people, `removed` saved ids). */
  onChange: (change: WhitelistChange) => void;
  search: (query: string) => Promise<SharingSearchUser[]>;
}

const initialOf = (p: SharingPerson) => (p.name || p.username || "U")[0].toUpperCase();

export function WhitelistUserPicker({ saved, change, onChange, search }: WhitelistUserPickerProps) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query.trim(), 300);
  const [results, setResults] = useState<SharingSearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const people = visibleWhitelist(saved, change);

  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setFailed(false);
    search(debounced)
      .then((found) => !cancelled && setResults(found))
      .catch(() => !cancelled && (setResults([]), setFailed(true)))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, search]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (person: SharingSearchUser) => {
    onChange(addPerson(change, saved, person));
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const candidates = results.filter((r) => !people.some((p) => p.id === r.id));

  return (
    <div className="space-y-3">
      <Label>Danh sách người được phép ({people.length})</Label>
      <div className="relative" ref={boxRef}>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Tìm theo username hoặc tên (từ 3 ký tự)..."
          className="pl-9"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {open && query.trim().length >= MIN_QUERY && !searching && (
          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-lg">
            {failed ? (
              <p className="p-3 text-center text-sm text-destructive">Không thể tìm kiếm, thử lại sau</p>
            ) : candidates.length === 0 ? (
              <p className="p-3 text-center text-sm text-muted-foreground">Không tìm thấy người dùng</p>
            ) : (
              candidates.map((user) => (
                <button
                  key={user.id}
                  onClick={() => pick(user)}
                  className="flex w-full items-center gap-3 p-2 text-left transition-colors hover:bg-muted"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatar || undefined} />
                    <AvatarFallback>{initialOf(user)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name || user.username}</p>
                    <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {people.length > 0 && (
        <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">
          {people.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-sm">
              <Avatar className="h-5 w-5">
                <AvatarImage src={p.avatar || "/avt-default.webp"} />
              </Avatar>
              <span className="max-w-[120px] truncate">{p.name || p.username}</span>
              <button
                onClick={() => onChange(removePerson(change, saved, p.id))}
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label={`Gỡ ${p.name || p.username}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
