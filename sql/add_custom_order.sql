-- Add custom_order column to bookmarks table
ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS custom_order INTEGER;

-- Create an index for better performance when sorting by custom_order
CREATE INDEX IF NOT EXISTS idx_bookmarks_custom_order ON bookmarks(user_id, custom_order);

-- Update existing bookmarks to have a default custom_order based on access_count (descending)
-- This ensures existing bookmarks have a valid order when switching to custom sort
-- Pinned bookmarks get lower numbers (0-999), unpinned get higher numbers (1000+)
UPDATE bookmarks 
SET custom_order = CASE 
    WHEN is_pinned = true THEN 
        row_number() OVER (PARTITION BY user_id, is_pinned ORDER BY access_count DESC, created_at DESC) - 1
    ELSE 
        row_number() OVER (PARTITION BY user_id, is_pinned ORDER BY access_count DESC, created_at DESC) + 999
END
WHERE custom_order IS NULL;