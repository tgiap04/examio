import * as React from "react";
import { message } from "antd";
import type { MessageType } from "antd/es/message/interface";
import { createToastDeduper } from "@/lib/toast-dedupe";

type ToastVariant = "default" | "destructive" | "warning";
type ToastOptions = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
};

type ToastFn = {
  (title: React.ReactNode, options?: Omit<ToastOptions, "title">): MessageType;
  success: (content: React.ReactNode, options?: Omit<ToastOptions, "title">) => MessageType;
  error: (content: React.ReactNode, options?: Omit<ToastOptions, "title">) => MessageType;
  info: (content: React.ReactNode, options?: Omit<ToastOptions, "title">) => MessageType;
  warning: (content: React.ReactNode, options?: Omit<ToastOptions, "title">) => MessageType;
};

type LegacyToastFn = ToastFn & ((options: ToastOptions) => MessageType);

function ToastProvider({ children }: React.PropsWithChildren) {
  return <>{children}</>;
}

function renderContent(title: React.ReactNode, options?: Omit<ToastOptions, "title">) {
  if (!options?.description) return title;
  return <span>{title ? <strong>{title}</strong> : null}{title ? " " : null}{options.description}</span>;
}

// Identical toasts inside the antd display window collapse into one (a denied
// action is toasted by the axios interceptor AND by the caller's catch block).
const dedupe = createToastDeduper<MessageType>();
const once = (variant: string, content: React.ReactNode, show: () => MessageType): MessageType =>
  typeof content === "string" ? dedupe(`${variant}:${content}`, show) : show();

const toast = ((title: React.ReactNode, options?: Omit<ToastOptions, "title">) => {
  const content = renderContent(title, options);
  if (options?.variant === "destructive") return once("error", content, () => message.error(content));
  if (options?.variant === "warning") return once("warning", content, () => message.warning(content));
  return once("info", content, () => message.info(content));
}) as ToastFn;

toast.success = (content: React.ReactNode, options?: Omit<ToastOptions, "title">) => {
  const rendered = renderContent(content, options);
  return once("success", rendered, () => message.success(rendered));
};
toast.error = (content: React.ReactNode, options?: Omit<ToastOptions, "title">) => {
  const rendered = renderContent(content, options);
  return once("error", rendered, () => message.error(rendered));
};
toast.info = (content: React.ReactNode, options?: Omit<ToastOptions, "title">) => {
  const rendered = renderContent(content, options);
  return once("info", rendered, () => message.info(rendered));
};
toast.warning = (content: React.ReactNode, options?: Omit<ToastOptions, "title">) => {
  const rendered = renderContent(content, options);
  return once("warning", rendered, () => message.warning(rendered));
};

const legacyToast = ((options: ToastOptions) => toast(options.title, { description: options.description, variant: options.variant })) as LegacyToastFn;
legacyToast.success = toast.success;
legacyToast.error = toast.error;
legacyToast.info = toast.info;
legacyToast.warning = toast.warning;

const toastHookValue = { toast: legacyToast };

function useToast(): { toast: LegacyToastFn } {
  return toastHookValue;
}

export { ToastProvider, toast, useToast };
