/**
 * Per-tag accent colors.
 *
 * Only the palette key (`"red"`, `"teal"`, …) is stored in the database, so the
 * concrete classes — and therefore the light/dark rendering — stay defined here
 * in the frontend. Every tag has a color: tags that were never given one (and
 * every tag created before the column existed) fall back to `DEFAULT_TAG_COLOR`,
 * the app's blue accent.
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

/** Used for tags with no color stored — keeps the app's blue accent as the default. */
export const DEFAULT_TAG_COLOR: TagColor = "blue";

/**
 * Chip while the tag is off. Colorless on purpose, and identical for every
 * color: tinting the whole filter bar turns it into a wall of color in which
 * the handful of tags actually switched on no longer stand out. Color is what
 * marks a tag as active, so it only appears once the tag is on.
 */
export const TAG_CHIP_OFF = "bg-secondary border border-input";

interface TagColorStyles {
  /**
   * Chip while the tag is on — selected as a filter, or listed on a bookmark
   * card. A light tint rather than a solid fill, so a card carrying three tags
   * stays quiet enough to read the title over.
   */
  chipOn: string;
  /** Solid dot used by the color picker in Tag Manager. */
  swatch: string;
}

export const TAG_COLOR_STYLES: Record<TagColor, TagColorStyles> = {
  red: {
    chipOn: "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30",
    swatch: "bg-red-500",
  },
  orange: {
    chipOn: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/30",
    swatch: "bg-orange-500",
  },
  amber: {
    chipOn: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30",
    swatch: "bg-amber-500",
  },
  green: {
    chipOn: "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/30",
    swatch: "bg-green-500",
  },
  teal: {
    chipOn: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30",
    swatch: "bg-teal-500",
  },
  blue: {
    chipOn: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30",
    swatch: "bg-blue-500",
  },
  violet: {
    chipOn: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30",
    swatch: "bg-violet-500",
  },
  pink: {
    chipOn: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border border-pink-500/30",
    swatch: "bg-pink-500",
  },
};

export function isTagColor(value: string | null | undefined): value is TagColor {
  return !!value && (TAG_COLORS as readonly string[]).includes(value);
}

/** The stored color, or the default one when nothing (valid) is stored. */
export function resolveTagColor(color: string | null | undefined): TagColor {
  return isTagColor(color) ? color : DEFAULT_TAG_COLOR;
}

/** Styles for a stored color value, falling back to the default color. */
export function getTagColorStyles(color: string | null | undefined): TagColorStyles {
  return TAG_COLOR_STYLES[resolveTagColor(color)];
}
