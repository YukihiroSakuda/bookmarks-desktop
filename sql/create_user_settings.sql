-- ユーザ設定テーブルを作成
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_mode TEXT DEFAULT 'grid' CHECK (display_mode IN ('grid', 'list')),
  list_columns INTEGER DEFAULT 4 CHECK (list_columns >= 1 AND list_columns <= 4),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS (Row Level Security) を有効化
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- ユーザ自身の設定のみアクセス可能にするポリシーを作成
CREATE POLICY "Users can only access their own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

-- updated_at を自動更新するトリガー関数を作成（もし存在しない場合）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- updated_at トリガーを設定
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();