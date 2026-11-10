import { useEffect, type PropsWithChildren } from "react";
import { ConfigProvider, theme as antTheme } from "antd";
import { ThemeProvider, useThemeContext } from "@/provider/ThemeProvider";
import { ToastProvider } from "@/components/antd/toast";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { AuthSyncBootstrap } from "@/components/auth/AuthSyncBootstrap";
import { captureUtmSource } from "@/lib/utmSource";

function AntdConfigProvider({ children }: PropsWithChildren) {
  const { isDarkMode } = useThemeContext();

  const antdTheme = {
    algorithm: isDarkMode ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: "#cc785c",
      colorError: "#c64545",
      colorWarning: "#d4a017",
      colorSuccess: "#5db872",
      colorBgContainer: isDarkMode ? "#24211d" : "#faf9f5",
      colorBgElevated: isDarkMode ? "#24211d" : "#faf9f5",
      colorBorder: isDarkMode ? "#37312a" : "#e6dfd8",
      colorText: isDarkMode ? "#faf7ef" : "#141413",
      colorTextSecondary: isDarkMode ? "#a99f91" : "#6c6a64",
      borderRadius: 8,
      fontFamily: "inherit",
    },
    components: {
      Button: {
        borderRadius: 8,
        controlHeight: 40,
      },
      Modal: {
        borderRadiusLG: 12,
        contentBg: isDarkMode ? "#24211d" : "#faf9f5",
        headerBg: isDarkMode ? "#24211d" : "#faf9f5",
        footerBg: isDarkMode ? "#24211d" : "#faf9f5",
      },
    },
  };

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
