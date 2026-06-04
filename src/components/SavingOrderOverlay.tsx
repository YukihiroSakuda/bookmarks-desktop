import { Loader2 } from "lucide-react";

interface SavingOrderOverlayProps {
  isVisible: boolean;
}

export function SavingOrderOverlay({ isVisible }: SavingOrderOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl p-8 shadow-2xl max-w-md mx-4 border">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-foreground" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">
              Saving Your Order
            </h3>
            <p className="text-sm text-muted-foreground">
              Please wait while we save your custom bookmark order...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
