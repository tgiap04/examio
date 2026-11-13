"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/antd/card";
import { Button } from "@/components/antd/button";
import { Monitor, Smartphone, Tablet, Loader2, LogOut, MapPin, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { getDevicesApi, logoutDeviceApi, logoutAllOthersApi, type Device } from "@/apis/devicesApi";
import { useToast } from "@/components/antd/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/antd/alert-dialog";

export function DeviceList() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [logoutingId, setLogoutingId] = useState<string | null>(null);
  const [isLogoutingAll, setIsLogoutingAll] = useState(false);
  const { toast } = useToast();

  const fetchDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await getDevicesApi();
      setDevices(result.devices);
    } catch {
      toast.error("Không thể tải danh sách thiết bị");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const handleLogoutDevice = async (sessionId: string) => {
    try {
      setLogoutingId(sessionId);
      await logoutDeviceApi(sessionId);
      toast.success("Đã đăng xuất thiết bị");
      setDevices((prev) => prev.filter((d) => d.id !== sessionId));
    } catch {
      toast.error("Không thể đăng xuất thiết bị");
    } finally {
      setLogoutingId(null);
    }
  };

  const handleLogoutAllOthers = async () => {
    try {
      setIsLogoutingAll(true);
      const result = await logoutAllOthersApi();
      toast.success(`Đã đăng xuất ${result.devicesLoggedOut} thiết bị khác`);
      setDevices((prev) => prev.filter((d) => d.isCurrent));
    } catch {
      toast.error("Không thể đăng xuất các thiết bị khác");
    } finally {
      setIsLogoutingAll(false);
    }
  };

  const getDeviceIcon = (deviceName: string | null, os: string | null) => {
    const name = (deviceName || "").toLowerCase();
    const osLower = (os || "").toLowerCase();
    if (name.includes("iphone") || name.includes("android") || osLower.includes("ios") || osLower.includes("android")) {
      return <Smartphone className="h-5 w-5" />;
    }
    if (name.includes("ipad") || name.includes("tablet")) {
      return <Tablet className="h-5 w-5" />;
    }
    return <Monitor className="h-5 w-5" />;
  };

  const currentDevice = devices.find((d) => d.isCurrent);
  const otherDevices = devices.filter((d) => !d.isCurrent);

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-surface-soft">
              <Monitor className="h-5 w-5 text-coral" />
            </div>
            <div>
              <div className="font-display text-xl font-medium text-ink">Thiết bị</div>
              <p className="mt-0.5 text-sm font-normal text-muted-text">Quản lý thiết bị đã đăng nhập</p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-text" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-surface-soft">
              <Monitor className="h-5 w-5 text-coral" />
            </div>
            <div>
              <div className="font-display text-xl font-medium text-ink">Thiết bị</div>
              <p className="mt-0.5 text-sm font-normal text-muted-text">
                {devices.length} thiết bị đã đăng nhập
              </p>
            </div>
          </CardTitle>
          {otherDevices.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-error/30 text-error hover:border-error hover:bg-error/5 shrink-0"
                >
                  {isLogoutingAll ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Đăng xuất tất cả
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Xác nhận đăng xuất
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Đăng xuất khỏi {otherDevices.length} thiết bị khác? Các phiên đăng nhập trên những thiết bị đó sẽ kết thúc ngay.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLogoutAllOthers}
                    className="bg-error text-white hover:bg-error/90"
                  >
                    Đăng xuất tất cả
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {devices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-soft">
              <Monitor className="h-6 w-6 text-muted-text" />
            </div>
            <p className="text-sm text-muted-text">Không có thiết bị nào đã đăng nhập.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Current device */}
            {currentDevice && (
              <div className="flex items-start gap-4 rounded-xl border-2 border-coral/30 bg-coral/5 p-4 transition-all">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-coral/10 text-brand-strong">
                  {getDeviceIcon(currentDevice.deviceName, currentDevice.os)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{currentDevice.deviceName || "Thiết bị hiện tại"}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2 py-0.5 text-xs font-medium text-brand-strong">
                      <CheckCircle2 className="h-3 w-3" />
                      Thiết bị này
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-sm text-muted-text">
                      {currentDevice.browser || "Trình duyệt"} · {currentDevice.os || "Hệ điều hành"}
                    </p>
                    {currentDevice.location && (
                      <p className="flex items-center gap-1 text-xs text-muted-text">
                        <MapPin className="h-3 w-3" />
                        {currentDevice.location}
                      </p>
                    )}
                    <p className="flex items-center gap-1 text-xs text-muted-text">
                      <Clock className="h-3 w-3" />
                      Hoạt động {currentDevice.lastActivity}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Other devices */}
            {otherDevices.map((device) => (
              <div key={device.id} className="flex items-start gap-4 rounded-xl border border-hairline bg-surface-soft p-4 transition-all hover:border-hairline/80">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-card text-muted-text">
                  {getDeviceIcon(device.deviceName, device.os)}
                </div>
                <div className="flex flex-1 min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-ink">{device.deviceName || "Thiết bị không xác định"}</span>
                    <div className="mt-1.5 space-y-0.5">
                      <p className="text-sm text-muted-text">
                        {device.browser || "Trình duyệt"} · {device.os || "Hệ điều hành"}
                      </p>
                      {device.location && (
                        <p className="flex items-center gap-1 text-xs text-muted-text">
                          <MapPin className="h-3 w-3" />
                          {device.location}
                        </p>
                      )}
                      <p className="flex items-center gap-1 text-xs text-muted-text">
                        <Clock className="h-3 w-3" />
                        Hoạt động {device.lastActivity}
                      </p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 shrink-0 gap-1.5 text-error hover:bg-error/10"
                        disabled={logoutingId === device.id}
                      >
                        {logoutingId === device.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <LogOut className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">Đăng xuất</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Đăng xuất khỏi thiết bị này?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {device.deviceName || "Thiết bị"} ({device.browser})
                          <br />
                          Phiên đăng nhập trên thiết bị này sẽ kết thúc.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleLogoutDevice(device.id)}
                          className="bg-error text-white hover:bg-error/90"
                        >
                          Đăng xuất
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
