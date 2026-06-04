import { FolderOpen } from "lucide-react";

interface DropOverlayProps {
  visible: boolean;
}

export function DropOverlay({ visible }: DropOverlayProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* backdrop */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

      {/* center card */}
      <div className="relative flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/10 px-16 py-12 shadow-lg">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/15">
          <FolderOpen size={32} className="text-blue-500" strokeWidth={1.5} />
        </div>
        <p className="text-lg font-semibold text-foreground">Drop to add bookmark</p>
      </div>
    </div>
  );
}
