# Design: localStorage SWR Cache for Initial Load

**Date:** 2026-05-27  
**Goal:** Eliminate the blank-screen period on initial page load by serving cached data instantly while fetching fresh data in the background.

## Problem

The page is a pure client component (`"use client"`). All data fetching happens inside a `useEffect` after React hydration, which means:

1. HTML loads → JS bundle loads → React hydrates → `useEffect` fires → 4 parallel API calls → data fills in

The gap between hydration and data arrival causes a visible blank/empty state on every page load.

## Solution: localStorage SWR (Stale-While-Revalidate)

Read cached data from localStorage synchronously on mount, display it immediately, then fetch fresh data in the background and silently update.

## Data Flow

```
1. Component mounts
   └── Read localStorage cache (synchronous)
       ├── Cache exists → render immediately with cached data
       └── No cache    → render empty state (first visit only)

2. 4 API calls fire in parallel (background)
   └── Complete → update state silently → overwrite cache

3. Subsequent mutations (add / edit / delete / settings change)
   └── After re-fetch triggered by mutation → update cache
```

## Cache Structure

Single localStorage key `bm_app_cache`:

```json
{
  "bookmarks": [...],
  "tags": [...],
  "tagRules": [...],
  "settings": {...}
}
```

## Files Changed

| File | Change |
|---|---|
| `src/lib/appCache.ts` | New file. `readAppCache()` / `writeAppCache()` |
| `src/hooks/useBookmarks.ts` | Add `initialBookmarks` option |
| `src/hooks/useTagManagement.ts` | Add `initialTags`, `initialTagRules` options |
| `src/hooks/useUserSettings.ts` | Add `initialSettings` option |
| `src/app/page.tsx` | Read cache → pass to hooks as initial values → write cache after fetch |

## Key Constraints

- localStorage is unavailable during SSR; cache read must use a client-side guard
- Wrap all cache I/O in `try/catch` to handle private browsing or storage quota errors
- Cache has no TTL — it is always overwritten by the latest successful fetch
- Mutations that trigger a re-fetch will also update the cache, keeping it fresh across sessions
