"use client";

import { useState } from "react";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { Label } from "@/components/antd/label";
import { Save, Loader2, AlertCircle, Mail, User as UserIcon } from "lucide-react";
import type { UserProfile, UpdateProfileData } from "@/apis/profileApi";
import { useAuthStore } from "@/stores/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/antd/card";

interface ProfileFormProps {
  profile: UserProfile;
  onSubmit: (data: UpdateProfileData) => Promise<void>;
  isSubmitting?: boolean;
}

export function ProfileForm({
  profile,
  onSubmit,
  isSubmitting = false,
}: ProfileFormProps) {
  const [name, setName] = useState(profile.name || "");
  const [bio, setBio] = useState(profile.bio || "");
  const { sendVerificationEmail, loading: isSendingVerification } = useAuthStore();

  const hasChanges = name !== (profile.name || "") || bio !== (profile.bio || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const changedData: UpdateProfileData = {};

    if (name !== (profile.name || "")) changedData.name = name || undefined;
    if (bio !== (profile.bio || "")) changedData.bio = bio || undefined;

    if (Object.keys(changedData).length > 0) {
      await onSubmit(changedData);
    }
  };

  const handleResendVerification = async () => {
    try {
      await sendVerificationEmail();
    } catch (error) {
      console.error("Xác minh thất bại:", error);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-surface-soft">
            <UserIcon className="h-5 w-5 text-coral" />
          </div>
          <div>
            <div className="font-display text-xl font-medium text-ink">Thông tin cá nhân</div>
            <p className="mt-0.5 text-sm font-normal text-muted-text">Cập nhật thông tin công khai của bạn</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Verification warning */}
          {!profile.isVerified && (
            <div className="flex items-start gap-4 rounded-xl border border-warning/30 bg-warning/5 p-4 transition-all animate-in fade-in duration-300">
              <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1 space-y-1">
                <h4 className="text-sm font-semibold text-ink">Địa chỉ email chưa được xác minh</h4>
                <p className="text-xs text-muted-text">
                  Email của bạn chưa được xác minh. Vui lòng xác minh để bảo vệ tài khoản và truy cập đầy đủ các tài nguyên học tập.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResendVerification}
                  disabled={isSendingVerification}
                  className="mt-2 text-xs gap-1 border-warning/30 text-warning hover:bg-warning/10"
                >
                  {isSendingVerification ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Đang gửi...
                    </>
                  ) : (
                    "Gửi email xác thực ngay"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Name & Bio input fields */}
          <div className="grid gap-5 sm:grid-cols-1">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-ink">
                Tên hiển thị
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên hiển thị của bạn"
                maxLength={100}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-sm font-medium text-ink">
                Giới thiệu
              </Label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Chia sẻ một chút về bản thân bạn..."
                maxLength={500}
                rows={3}
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-text transition-all focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 hover:border-coral/40"
              />
              <p className="text-right text-xs text-muted-soft">{bio.length}/500</p>
            </div>
          </div>

          {/* Account Details (read-only grid) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-ink">Chi tiết tài khoản</Label>
            <div className="grid gap-4 rounded-xl border border-hairline bg-surface-soft p-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-card text-muted-text">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xxs font-medium uppercase tracking-wider text-muted-soft">Email</span>
                  <p className="truncate text-sm font-medium text-ink">{profile.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-card text-muted-text">
                  <span className="text-xs font-semibold">@</span>
                </div>
                <div className="min-w-0">
                  <span className="text-xxs font-medium uppercase tracking-wider text-muted-soft">Tên đăng nhập</span>
                  <p className="truncate text-sm font-medium text-ink">@{profile.username}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center justify-end pt-2">
            <Button
              type="submit"
              disabled={isSubmitting || !hasChanges}
              className="gap-2 bg-brand-soft text-brand-strong hover:bg-brand-soft-hover disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Lưu thay đổi
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
