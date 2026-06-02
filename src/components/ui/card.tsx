import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)} {...props} />
));
Card.displayName = "Card";

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-2.5 border-b border-border bg-surface-2 px-5 py-3", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("font-mono text-[13px] font-semibold tracking-wide text-text", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardTag({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("ml-auto rounded-sm border border-accent/20 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent", className)}
      {...props}
    />
  );
}
