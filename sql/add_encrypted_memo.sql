-- Add encrypted memo columns to bookmarks table
ALTER TABLE bookmarks
  ADD COLUMN encrypted_memo TEXT,
  ADD COLUMN memo_iv TEXT;

-- Add comment for documentation
COMMENT ON COLUMN bookmarks.encrypted_memo IS 'AES-256-CBC encrypted memo content';
COMMENT ON COLUMN bookmarks.memo_iv IS 'Initialization vector for AES-256-CBC decryption';
