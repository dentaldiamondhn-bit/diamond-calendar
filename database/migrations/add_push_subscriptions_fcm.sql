-- Add FCM support to push_subscriptions table

ALTER TABLE push_subscriptions
ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'web'
  CHECK (platform IN ('web', 'capacitor'));

ALTER TABLE push_subscriptions
ADD COLUMN IF NOT EXISTS fcm_token TEXT;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_fcm_token
  ON push_subscriptions (fcm_token)
  WHERE platform = 'capacitor';
