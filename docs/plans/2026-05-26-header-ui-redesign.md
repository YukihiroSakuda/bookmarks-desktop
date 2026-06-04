# Header UI Redesign — Flat 2-Row Layout

**Date:** 2026-05-26  
**Status:** Approved  
**Scope:** `BookmarkHeader.tsx`, `SortControls.tsx`

---

## Goal

Modernize the header area to match a Linear / Notion aesthetic. The current design uses heavy card containers (bg-card, border, shadow, rounded corners) for both the tag filter panel and the sort controls, making the UI feel dated and visually noisy. The redesign flattens both sections and consolidates them into a single compact row.

---

## Current Structure (3 rows)

```
Row 1: [Bookmarks title]  [Search bar]  [?] [⊞] [⋮] [+ Add Bookmark]
Row 2: bg-card rounded-2xl border shadow — Filter by Tags panel
         → Tag chips + [Tag Manager] [Tag Rule] buttons
Row 3: bg-card rounded-xl border shadow — Sort controls
         → [Your Order] [Access Count] [Title] [Created Date] + order switch
```

---

## Target Structure (2 rows)

```
Row 1: [Bookmarks]  [🔍 Find your bookmarks...────────]  [?] [⊞] [⋮] [+ Add]
Row 2 (flat, no card): Sort: [Your Order] [Access ↓] [Title] [Date]  │  #tag1 #tag2 …  [🏷] [📋]
```

---

## Design Decisions

### Row 1 changes
- Logo font size: `text-4xl font-bold` → `text-2xl font-semibold`
- All other elements unchanged

### Row 2 changes
- **Remove** from tag filter: `bg-card backdrop-blur-sm p-3 rounded-2xl border shadow-sm`
- **Remove** from sort controls: `bg-card backdrop-blur-sm p-2 rounded-xl border shadow-sm`
- **Merge** tag filter and sort controls into one horizontal row
- **Layout**: sort section on the left, vertical `│` divider (`border-l`), tags section on the right (flex-1, overflow-x-auto)
- **Tag Manager / Tag Rule buttons**: icon-only (remove button text labels) to save horizontal space
- **"Filter by Tags" label**: remove the heading; tags speak for themselves
- **"# Sort by:" label**: keep short label or remove, show sort buttons directly
- **"Ctrl + Click" hint**: remove from header, document in HelpDialog only
- Wrap entire Row 2 in a single `border-b pb-3 mb-3` to visually separate header from list

### Spacing & Typography
- Row 2 uses `py-2` instead of `p-3`
- Tag chips remain unchanged in appearance
- Active sort button remains `variant="primary"` (blue fill)
- Muted secondary labels use `text-xs text-muted-foreground`

---

## Files to Change

| File | Change |
|------|--------|
| `src/components/BookmarkHeader.tsx` | Remove card wrappers, merge tag + sort row, shrink logo, remove verbose labels |
| `src/components/SortControls.tsx` | Remove outer card wrapper (accept optional className or remove internally) |

---

## Out of Scope

- BookmarkCard design
- Search history dropdown behavior
- Mobile / responsive breakpoints (maintain existing md: breakpoints)
- Dark mode (no color changes beyond removing card backgrounds)
