import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { pathBasename } from "@/shared/bookmarks/form";
import { BookmarkUI } from "@/types/bookmark";

interface UseExplorerImportProps {
  isModalOpen: boolean;
  onPathDetected: (values: Partial<Pick<BookmarkUI, "title" | "url">>) => void;
}

export function useExplorerImport({ isModalOpen, onPathDetected }: UseExplorerImportProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handlePath = useCallback(
    (path: string) => {
      if (isModalOpen) return;
      onPathDetected({ url: path, title: pathBasename(path) });
    },
    [isModalOpen, onPathDetected]
  );

  // Cold start: app launched with --path from context menu
  useEffect(() => {
    invoke<string | null>("get_pending_path").then((path) => {
      if (path) handlePath(path);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // Hot path: app already running, second instance tried to launch (single-instance plugin)
  useEffect(() => {
    const promise = listen<string>("open-path-bookmark", (event) => {
      handlePath(event.payload);
    });
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, [handlePath]);

  // Drag & drop from Explorer
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    let cleanup: (() => void) | undefined;

    win
      .onDragDropEvent((event) => {
        const type = event.payload.type;
        if (type === "enter") {
          setIsDragging(true);
        } else if (type === "leave") {
          setIsDragging(false);
        } else if (type === "drop") {
          setIsDragging(false);
          if (event.payload.paths.length > 0) {
            handlePath(event.payload.paths[0]);
          }
        }
      })
      .then((unlisten) => {
        cleanup = unlisten;
      });

    return () => cleanup?.();
  }, [handlePath]);

  return { isDragging };
}
