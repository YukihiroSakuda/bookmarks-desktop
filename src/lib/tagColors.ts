/**
 * Optional per-tag accent colors.
 *
 * Only the palette key (`"red"`, `"teal"`, …) is stored in the database, so the
 * concrete classes — and therefore the light/dark rendering — stay defined here
 * in the frontend. Tags without a color keep the app's default monochrome chip
 * (and the blue accent when selected), so the color is strictly opt-in.
 *
 * Tailwind needs the class names to appear literally in the source, hence the
 * fully written-out record instead of `bg-${color}-500` templates.
 */

export const TAG_COLORS = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

interface TagColorStyles {
  /** Chip in its normal (unselected) state. */
  chip: string;
  /**
   * Chip while the tag is selected as a filter, or shown on a bookmark card.
   * The text tone is picked per color so it stays readable on the solid fill —
   * white on the deep hues, near-black on the light ones.
   */
  chipSelected: string;
  /** Solid dot used by the color picker in Tag Manager. */
  swatch: string;
}

export const TAG_COLOR_STYLES: Record<TagColor, TagColorStyles> = {
  red: {
    chip: "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30",
    chipSelected: "bg-red-600 text-white border border-red-600",
    swatch: "bg-red-500",
  },
  orange: {
    chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/30",
    chipSelected: "bg-orange-500 text-neutral-900 border border-orange-500",
    swatch: "bg-orange-500",
  },
  amber: {
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30",
    chipSelected: "bg-amber-500 text-neutral-900 border border-amber-500",
    swatch: "bg-amber-500",
  },
  green: {
    chip: "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/30",
    chipSelected: "bg-green-500 text-neutral-900 border border-green-500",
    swatch: "bg-green-500",
  },
  teal: {
    chip: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30",
    chipSelected: "bg-teal-500 text-neutral-900 border border-teal-500",
    swatch: "bg-teal-500",
  },
  blue: {
    chip: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30",
    chipSelected: "bg-blue-500 text-white border border-blue-500",
    swatch: "bg-blue-500",
  },
  violet: {
    chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30",
    chipSelected: "bg-violet-500 text-white border border-violet-500",
    swatch: "bg-violet-500",
  },
  pink: {
    chip: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border border-pink-500/30",
    chipSelected: "bg-pink-600 text-white border border-pink-600",
    swatch: "bg-pink-500",
  },
};

export function isTagColor(value: string | null | undefined): value is TagColor {
  return !!value && (TAG_COLORS as readonly string[]).includes(value);
}

/** Styles for a stored color value, or `null` when the tag has no color set. */
export function getTagColorStyles(color: string | null | undefined): TagColorStyles | null {
  return isTagColor(color) ? TAG_COLOR_STYLES[color] : null;
}
