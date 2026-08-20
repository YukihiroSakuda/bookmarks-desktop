export interface Tag {
  id: string;
  name: string;
  /** Palette key from `src/lib/tagColors.ts`, or null when no color is set. */
  color: string | null;
  /** Manual order set in Tag Manager; 0 for tags never reordered. */
  sort_order: number;
  created_at: string;
  updated_at: string;
}
