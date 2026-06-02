import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn("h-1 overflow-hidden rounded bg-border", className)}>
      <div
        className={cn("h-full rounded bg-accent transition-[width] duration-300 ease-out", barClassName)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
