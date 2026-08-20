import { X } from "lucide-react";
import { memo, useCallback } from "react";
import { getTagColorStyles } from "@/lib/tagColors";

interface TagProps {
  tag: string;
  onDelete?: () => void;
  onClick?: (ctrlKey: boolean) => void;
  isSelected?: boolean;
  isDisabled?: boolean;
  /** Palette key set in Tag Manager. Falls back to the default (blue). */
  color?: string | null;
}

const Tag = memo(function Tag({
  tag,
  onDelete,
  onClick,
  isSelected,
  isDisabled = false,
  color,
}: TagProps) {
  const colorStyles = getTagColorStyles(color);
  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && !isDisabled) {
      onDelete();
    }
  }, [onDelete, isDisabled]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (onClick && !isDisabled) {
      onClick(e.ctrlKey);
    }
  }, [onClick, isDisabled]);

  return (
    <div
      className={`px-1.5 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
        onClick && !isDisabled ? "cursor-pointer" : ""
      } ${
        isSelected ? colorStyles.chipSelected : colorStyles.chip
      } ${
        isDisabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
      onClick={handleClick}
    >
      {tag}
      {onDelete && (
        <button
          onClick={handleDeleteClick}
          className="ml-1"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
});

export { Tag };
