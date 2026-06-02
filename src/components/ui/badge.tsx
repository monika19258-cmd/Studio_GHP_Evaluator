import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold", {
  variants: {
    variant: {
      pass: "border-accent/25 bg-accent/15 text-accent",
      fail: "border-danger/20 bg-danger/10 text-danger",
      partial: "border-warn/20 bg-warn/15 text-warn",
      na: "border-border bg-surface-3 text-text-3",
    },
  },
  defaultVariants: { variant: "na" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
