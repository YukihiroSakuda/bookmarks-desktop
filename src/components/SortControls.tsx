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
      case "recency":
        return "desc"; // 最近よく使っている順
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

  // Ordered the way the list is reached for: the neutral starting point first,
  // then the two the app derives, then the one the user arranged by hand. My
  // Order sits last so its Edit switch lands at the end of the row rather than
  // splitting the group.
  const sortOptions = [
    { value: "title" as SortOption, label: "Name", icon: TypeOutline },
    {
      value: "recency" as SortOption,
      label: "Most Used",
      icon: TrendingUp,
    },
    { value: "createdAt" as SortOption, label: "Date Added", icon: Clock },
    {
      value: "custom" as SortOption,
      label: "My Order",
      icon: UserRound,
    },
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
