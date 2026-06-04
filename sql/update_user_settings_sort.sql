-- Add sort settings to user_settings table
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS sort_option TEXT DEFAULT 'accessCount' CHECK (sort_option IN ('accessCount', 'title', 'createdAt', 'custom'));

ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS sort_order TEXT DEFAULT 'desc' CHECK (sort_order IN ('asc', 'desc'));

-- Update existing records with default values
UPDATE user_settings 
SET sort_option = 'accessCount', sort_order = 'desc'
WHERE sort_option IS NULL OR sort_order IS NULL;