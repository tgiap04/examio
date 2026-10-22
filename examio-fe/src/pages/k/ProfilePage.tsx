"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ProfileForm } from "@/components/molecules/profile/ProfileForm";
import { ChangePasswordSection } from "@/components/molecules/profile/ChangePasswordSection";
import { DeviceList } from "@/components/molecules/profile/DeviceList";
import {
  User,
  Shield,
  Monitor,
  Camera,
  Loader2,
  CheckCircle2,
  CalendarDays,
  Wallet,
  Mail,
} from "lucide-react";
import {
  getProfileApi,
  updateProfileApi,
  uploadAvatarApi,
  uploadBannerApi,
  type UserProfile,
} from "@/apis/profileApi";
import { useToast } from "@/components/antd/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import { useCan } from "@/hooks/useCan";
import { useWalletStore } from "@/stores/useWalletStore";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { getUser } = useAuthStore();
  const canUseWallet = useCan("wallet:use");
  const walletBalance = useWalletStore((s) => s.balance);
  const loadWalletBalance = useWalletStore((s) => s.loadBalance);
  const { toast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "devices">("profile");

  // Local image state
  const [avatar, setAvatar] = useState<string>("");
  const [banner, setBanner] = useState<string>("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Fetch profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await getProfileApi();
        setProfile(data);
        setAvatar(data.avatar || "");
        setBanner(data.banner || "");
      } catch (error) {
        console.error("Không thể tải hồ sơ:", error);
        toast.error("Không thể tải hồ sơ.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Balance comes from GET /wallet/info (wallet:use only), cached per session.
  useEffect(() => {
    if (canUseWallet) void loadWalletBalance();
  }, [canUseWallet, loadWalletBalance]);

  const refreshUserData = useCallback(async () => {
    try {
      const data = await getProfileApi();
      setProfile(data);
      setAvatar(data.avatar || "");
      setBanner(data.banner || "");
      await getUser();
    } catch (error) {
      console.error("Không thể làm mới dữ liệu người dùng:", error);
    }
  }, [getUser]);

  const handleProfileUpdate = useCallback(async (data: Parameters<typeof updateProfileApi>[0]) => {
    try {
      setIsSubmitting(true);
      await updateProfileApi(data);
      await refreshUserData();
      toast.success("Cập nhật hồ sơ thành công!");
    } catch (error) {
      console.error("Không thể cập nhật hồ sơ:", error);
      toast.error("Không thể cập nhật hồ sơ. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  }, [refreshUserData, toast]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingAvatar(true);
      const result = await uploadAvatarApi(file);
      setAvatar(result.url);
      await handleProfileUpdate({ avatar: result.url });
    } catch (error) {
      console.error("Lỗi tải ảnh đại diện:", error);
      toast.error("Không thể tải ảnh đại diện.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingBanner(true);
      const result = await uploadBannerApi(file);
      setBanner(result.url);
      await handleProfileUpdate({ banner: result.url });
    } catch (error) {
      console.error("Lỗi tải ảnh bìa:", error);
      toast.error("Không thể tải ảnh bìa.");
    } finally {
      setIsUploadingBanner(false);
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
      </div>
    );
  }

  const initials = (profile.name || profile.username || "U").slice(0, 2).toUpperCase();

  const joinDate = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("vi-VN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    : null;

  // Compute profile completeness score (20% for each filled/verified attribute)
  const getCompleteness = () => {
    let score = 0;
    if (profile.name) score += 20;
    if (profile.bio) score += 20;
    if (profile.avatar) score += 20;
    if (profile.banner) score += 20;
    if (profile.isVerified) score += 20;
    return score;
  };
  const completeness = getCompleteness();

  return (
    <div className="space-y-6 p-4 pb-20 sm:p-6 xl:p-8 max-w-7xl mx-auto mt-4">
      {/* Page Header */}
      <div className="pb-2">
        <h1
          className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-ink"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
        >
          Hồ sơ cá nhân
        </h1>
        <p className="mt-1 text-sm text-muted-text">Quản lý thông tin tài khoản, bảo mật và thiết bị đã đăng nhập của bạn.</p>
      </div>

      <div className="grid grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Sticky Summary Card */}
        <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-24">
          <div className="rounded-xl border border-hairline bg-surface-card overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md">
            {/* Banner Area */}
            <div
              className="group relative flex h-32 w-full cursor-pointer items-center justify-center overflow-hidden bg-gradient-to-br from-coral/20 via-canvas to-accent-teal/20"
              onClick={() => bannerInputRef.current?.click()}
            >
              {banner ? (
                <img
                  src={banner}
                  alt="Banner"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <div className="rounded-xl bg-surface-card p-2 border border-hairline/60">
                    <Camera className="h-4 w-4 text-muted-text" />
                  </div>
                  <span className="text-xxs font-semibold uppercase tracking-wider text-muted-text">Tải ảnh bìa</span>
                </div>
              )}
              <div className="absolute inset-0 bg-surface-dark/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 flex items-center justify-center">
                {isUploadingBanner ? (
                  <Loader2 className="h-6 w-6 animate-spin text-on-dark" />
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-on-dark uppercase tracking-wider">
                    <Camera className="h-3.5 w-3.5" />
                    Thay ảnh bìa
                  </span>
                )}
              </div>
            </div>

            {/* Avatar & Info Content */}
            <div className="px-6 pb-6 relative">
              {/* Floating Avatar Container */}
              <div className="absolute -top-12 left-6">
                <div
                  className="group relative cursor-pointer rounded-full border-4 border-surface-card shadow-md overflow-hidden h-20 w-20 sm:h-24 sm:w-24 bg-surface-soft flex items-center justify-center"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={profile.name || profile.username}
                      className="h-full w-full object-cover rounded-full"
                    />
                  ) : (
                    <span className="text-xl font-semibold text-coral sm:text-2xl uppercase select-none font-display">
                      {initials}
                    </span>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-surface-dark/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100 rounded-full">
                    {isUploadingAvatar ? (
                      <Loader2 className="h-5 w-5 animate-spin text-on-dark" />
                    ) : (
                      <Camera className="h-5 w-5 text-on-dark" />
                    )}
                  </div>
                </div>
              </div>

              {/* Profile details */}
              <div className="pt-12 sm:pt-16 space-y-4">
                <div className="space-y-2">
                  <h2 className="font-display text-2xl font-medium text-ink tracking-tight leading-none">
                    {profile.name || profile.username}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-text">
                    <span>@{profile.username}</span>
                    <span className="text-muted-soft select-none">·</span>
                    {profile.isVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success border border-success/20">
                        <CheckCircle2 className="h-3 w-3" />
                        Đã xác minh
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning border border-warning/20">
                        Chưa xác minh
                      </span>
                    )}
                  </div>
                </div>

                {/* Bio text block */}
                {profile.bio && (
                  <p className="text-sm text-body leading-relaxed border-l-2 border-coral/40 pl-3 italic text-muted-text">
                    "{profile.bio}"
                  </p>
                )}

                {/* Profile Completeness Tracker */}
                <div className="space-y-2 rounded-xl bg-canvas/70 p-4 border border-hairline">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-muted-text">Độ hoàn thiện hồ sơ</span>
                    <span className="font-bold text-coral">{completeness}%</span>
                  </div>
                  <div className="h-2 w-full bg-surface-soft rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-coral to-accent-amber rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${completeness}%` }}
                    />
                  </div>
                  <p className="text-xxs text-muted-soft">
                    {completeness === 100
                      ? "Hồ sơ của bạn đã hoàn thành đầy đủ! 🎉"
                      : "Thêm ảnh, viết giới thiệu & xác thực email để đạt 100%."}
                  </p>
                </div>

                {/* Wallet Balance Highlight */}
                {canUseWallet && (
                  <div className="rounded-xl border border-hairline/60 bg-gradient-to-br from-surface-card to-surface-soft p-4 shadow-sm relative overflow-hidden group">
                    <div className="absolute -right-6 -bottom-6 opacity-[0.03] text-ink transition-transform duration-500 group-hover:scale-110">
                      <Wallet className="h-24 w-24" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral/10 text-coral">
                        <Wallet className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xxs font-semibold uppercase tracking-wider text-muted-soft">Số dư trong ví</span>
                        <p className="font-mono text-lg font-bold text-ink tracking-tight mt-0.5">
                          {new Intl.NumberFormat("vi-VN", {
                            style: "currency",
                            currency: "VND",
                          }).format(walletBalance ?? 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Email and Join Date Footer details */}
                <div className="space-y-3 pt-4 border-t border-hairline/60 text-xs text-muted-text">
                  <div className="flex items-center gap-2.5">
                    <Mail className="h-4 w-4 text-muted-soft shrink-0" />
                    <span className="truncate">{profile.email}</span>
                  </div>
                  {joinDate && (
                    <div className="flex items-center gap-2.5">
                      <CalendarDays className="h-4 w-4 text-muted-soft shrink-0" />
                      <span>Tham gia ngày {joinDate}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Settings Columns */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Custom Pure Tailwind Tabs list */}
          <div className="inline-flex gap-1 rounded-xl border border-hairline bg-surface-soft p-1 w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveTab("profile")}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap flex-1 sm:flex-initial",
                activeTab === "profile"
                  ? "bg-coral text-white shadow-sm font-semibold animate-none"
                  : "text-muted-text hover:bg-surface-card hover:text-ink"
              )}
            >
              <User className="h-4 w-4" />
              Hồ sơ
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap flex-1 sm:flex-initial",
                activeTab === "security"
                  ? "bg-coral text-white shadow-sm font-semibold animate-none"
                  : "text-muted-text hover:bg-surface-card hover:text-ink"
              )}
            >
              <Shield className="h-4 w-4" />
              Bảo mật
            </button>
            <button
              onClick={() => setActiveTab("devices")}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap flex-1 sm:flex-initial",
                activeTab === "devices"
                  ? "bg-coral text-white shadow-sm font-semibold animate-none"
                  : "text-muted-text hover:bg-surface-card hover:text-ink"
              )}
            >
              <Monitor className="h-4 w-4" />
              Thiết bị
            </button>
          </div>

          {/* Render Active Tab Content */}
          <div className="transition-all duration-300">
            {activeTab === "profile" && (
              <ProfileForm
                profile={profile}
                onSubmit={handleProfileUpdate}
                isSubmitting={isSubmitting}
              />
            )}
            {activeTab === "security" && <ChangePasswordSection />}
            {activeTab === "devices" && <DeviceList />}
          </div>
        </div>
      </div>

      {/* Hidden file upload inputs */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
        disabled={isUploadingAvatar}
      />
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleBannerUpload}
        disabled={isUploadingBanner}
      />
    </div>
  );
}
