# Filter by Tags / Sort by UI — Divider Style

**Date:** 2026-05-26

## Problem

Filter by Tags と Sort by がそれぞれカード形式（`border`, `bg-card`, `shadow-sm`, `rounded`）で2段占有しており、ページ全体が重く見える。

## Decision

ボーダーなし・背景なしの **Divider スタイル** に変更する。

## Changes

### BookmarkHeader.tsx — Filter by Tags

- `bg-card backdrop-blur-sm p-3 rounded-2xl border shadow-sm` → `pb-3 border-b`
- ヒントテキスト「(Ctrl + Click to select multiple tags)」を削除

### SortControls.tsx — Sort by

- `bg-card backdrop-blur-sm p-2 rounded-xl border shadow-sm` → `pb-2 border-b`

## Result

カード枠が消えてセクション下の仕切り線1本だけになり、ページ全体がフラットでスッキリした印象になる。
