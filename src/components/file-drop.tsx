"use client";

import * as React from "react";
import { UploadCloud, Check, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropProps {
  label: string;
  sublabel?: string;
  accept?: string;
  multiple?: boolean;
  loadedName?: string | null;
  onFiles: (files: FileList) => void;
  className?: string;
  big?: boolean;
}

/** A click-or-drag upload zone matching the original dashed-teal aesthetic. */
export function FileDrop({ label, sublabel, accept, multiple, loadedName, onFiles, className, big }: FileDropProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);
  const loaded = Boolean(loadedName);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-surface-2 text-center transition-all",
        big ? "min-h-[140px] p-8" : "min-h-[120px] p-5",
        drag || loaded ? "border-accent bg-accent/10" : "border-border2 hover:border-accent hover:bg-accent/5",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files && e.target.files.length && onFiles(e.target.files)}
      />
      {loaded && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent">
          <Check className="h-2.5 w-2.5 text-black" />
        </span>
      )}
      {big ? <UploadCloud className={cn("h-8 w-8", loaded ? "text-accent" : "text-text-3")} /> : <FileCode className={cn("h-6 w-6", loaded ? "text-accent" : "text-text-3")} />}
      <span className="font-mono text-xs font-semibold text-text">{label}</span>
      <span className={cn("max-w-full break-all font-mono text-[11px]", loaded ? "text-accent" : "text-text-3")}>{loadedName || sublabel}</span>
    </div>
  );
}
