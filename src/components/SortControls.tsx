import { SortOption, SortOrder } from "@/types/bookmark";
import {
  ArrowUp,
  ArrowDown,
  Clock,
  TrendingUp,
  TypeOutline,
  UserRound,
} from "lucide-react";
import { Button } from "./Button";
import { Switch } from "@/components/ui/switch";

interface SortControlsProps {
  currentSort: SortOption;
  currentOrder: SortOrder;
  onSortChange: (option: SortOption) => void;
  onOrderChange: (order: SortOrder) => void;
  isOrderingMode?: boolean;
  onOrderingModeChange?: (enabled: boolean) => void;
  isSavingOrder?: boolean;
}

export function SortControls({
  currentSort,
  currentOrder,
  onSortChange,
  onOrderChange,
  isOrderingMode = false,
  onOrderingModeChange,
  isSavingOrder = false,
}: SortControlsProps) {
  const getDefaultOrder = (sortOption: SortOption): SortOrder => {
    switch (sortOption) {
      case "accessCount":
        return "desc"; // アクセスが多い順
      case "title":
        return "asc"; // 昇順
      case "createdAt":
        return "desc"; // 最新から
      default:
        return "desc";
    }
  };

  const handleSortButtonClick = (sortOption: SortOption) => {
    if (currentSort === sortOption && sortOption !== "custom") {
      // 同じソートオプションをクリックした場合は昇順・降順を切り替え
      onOrderChange(currentOrder === "asc" ? "desc" : "asc");
    } else {
      // 異なるソートオプションをクリックした場合は新しいソートに変更し、デフォルト順序を設定
      onSortChange(sortOption);
      if (sortOption !== "custom") {
        onOrderChange(getDefaultOrder(sortOption));
      }
    }
  };

  const sortOptions = [
    {
      value: "custom" as SortOption,
      label: "Custom",
      icon: UserRound,
    },
    {
      value: "accessCount" as SortOption,
      label: "Access Count",
      icon: TrendingUp,
    },
    { value: "title" as SortOption, label: "Title", icon: TypeOutline },
    { value: "createdAt" as SortOption, label: "Created Date", icon: Clock },
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">
        <span className="text-blue-500">#</span> Sort by:
      </span>
      <div className="flex items-center gap-1">
        {sortOptions.map(({ value, label, icon: Icon }) => {
          const shouldShowArrow = value !== "custom" && currentSort === value;
          const ArrowIcon = currentOrder === "asc" ? ArrowUp : ArrowDown;

          return (
            <div key={value} className="flex items-center gap-2">
              <Button
                onClick={() => handleSortButtonClick(value)}
                variant={currentSort === value ? "primary" : "secondary"}
                size="sm"
                icon={Icon}
                className="text-sm"
                disabled={isOrderingMode && value !== "custom"}
              >
                <span className="flex items-center gap-1">
                  {label}
                  {shouldShowArrow && <ArrowIcon size={14} />}
                </span>
              </Button>
              {value === "custom" && onOrderingModeChange && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-600 dark:text-neutral-400">
                    Edit
                  </span>
                  <Switch
                    checked={isOrderingMode}
                    onCheckedChange={onOrderingModeChange}
                    disabled={currentSort !== "custom" || isSavingOrder}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
