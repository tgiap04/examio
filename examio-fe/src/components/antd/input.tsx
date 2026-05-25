import * as React from "react";
import { Input as AntInput } from "antd";
import type { InputProps as AntInputProps } from "antd";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, AntInputProps>(({ className, ...props }, ref) => (
  <AntInput
    ref={ref as any}
    className={cn(
      "!rounded-md !border-hairline !bg-canvas !px-2 !py-2 !text-ink placeholder:!text-muted-foreground focus-within:!border-primary focus-within:!shadow-[0_0_0_3px_rgba(204,120,92,0.15)] hover:!border-primary/60",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
export { Input };
