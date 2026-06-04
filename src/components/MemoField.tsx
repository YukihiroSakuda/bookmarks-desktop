"use client";

import { useState, useCallback, useRef } from "react";
import { Copy, Check, StickyNote } from "lucide-react";
import { Button } from "./Button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MemoFieldProps {
  memo: string | undefined;
  compact?: boolean;
}

export function MemoField({ memo, compact = false }: MemoFieldProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handlePointerEnter = useCallback(() => {
    clearTimeout(hoverTimeout.current);
    setIsHovered(true);
  }, []);

  const handlePointerLeave = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setIsHovered(false), 100);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!memo) return;
    await navigator.clipboard.writeText(memo);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [memo]);

  if (!memo) return null;

  if (compact) {
    return (
      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <TooltipProvider delayDuration={200}>
          <Tooltip open={isHovered}>
            <TooltipTrigger asChild>
              <button
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted border border-border hover:bg-secondary transition-colors"
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleCopy();
                }}
              >
                <StickyNote className={`size-3 ${isCopied ? 'text-blue-500' : 'text-muted-foreground'}`} />
                <span className={`text-xs ${isCopied ? 'text-blue-500' : 'text-muted-foreground'}`}>
                  {isCopied ? 'Copied!' : 'Memo'}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="start"
              className="max-w-[300px] p-3 bg-popover text-popover-foreground border shadow-lg"
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeave}
            >
              <div className="flex flex-col gap-1.5">
                <p className="text-xs whitespace-pre-wrap break-words">{memo}</p>
                <p className="text-xs text-muted-foreground">
                  {isCopied ? (
                    <span className="text-blue-500 font-medium">Copied!</span>
                  ) : (
                    "Click to copy"
                  )}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Memo</span>
        {isCopied ? (
          <span className="text-xs text-blue-500 font-medium flex items-center gap-0.5">
            <Check className="size-3" />
            Copied!
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={Copy}
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
          />
        )}
      </div>
      <div className="text-sm mt-1 break-words" onClick={(e) => e.stopPropagation()}>
        <span className="whitespace-pre-wrap">{memo}</span>
      </div>
    </div>
  );
}
