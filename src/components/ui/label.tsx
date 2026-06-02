import * as React from "react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn("font-mono text-[11px] font-medium uppercase tracking-wide text-text-2", className)} {...props} />
));
Label.displayName = "Label";
