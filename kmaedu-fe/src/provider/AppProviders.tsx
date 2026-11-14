import { useEffect, type PropsWithChildren } from "react";
import { ConfigProvider, theme as antTheme } from "antd";
import { ThemeProvider } from "@/provider/ThemeProvider";
import { ToastProvider } from "@/components/antd/toast";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { AuthSyncBootstrap } from "@/components/auth/AuthSyncBootstrap";
import { captureUtmSource } from "@/lib/utmSource";

// Light-only theme; colours mirror the CSS tokens in src/app/globals.css.
const antdTheme = {
  algorithm: antTheme.defaultAlgorithm,
  token: {
    colorPrimary: "#d92d29",
    colorLink: "#b4231f",
    colorError: "#dc2626",
    colorWarning: "#d97706",
    colorSuccess: "#16a34a",
    colorBgLayout: "#f8fafc",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBorder: "#e4e7ec",
    colorBorderSecondary: "#eef0f3",
    colorText: "#0f172a",
    colorTextSecondary: "#64748b",
    borderRadius: 8,
    controlHeight: 36,
    fontSize: 14,
    fontFamily: "inherit",
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.05)",
  },
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 34,
      controlHeightSM: 28,
      controlHeightLG: 40,
      paddingInline: 14,
      paddingInlineSM: 10,
      fontWeight: 500,
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
    },
    Tag: { borderRadiusSM: 9999 },
    Modal: { borderRadiusLG: 12 },
  },
};

function AntdConfigProvider({ children }: PropsWithChildren) {
  return (
    <ConfigProvider theme={antdTheme}>
      {children}
    </ConfigProvider>
  );
}

export function AppProviders({ children }: PropsWithChildren) {
  // Bắt utm_source first-touch ngay lần load đầu (giữ tới khi đăng ký).
  useEffect(() => {
    captureUtmSource();
  }, []);

  return (
    <ThemeProvider
        attribute="class"
        defaultTheme="light"
        forcedTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <AntdConfigProvider>
          <ToastProvider>
            <AuthSyncBootstrap />
            <GoogleAnalytics />
            {children}
          </ToastProvider>
        </AntdConfigProvider>
      </ThemeProvider>
  );
}
