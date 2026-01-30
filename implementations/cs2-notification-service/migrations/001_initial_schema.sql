-- CS-2 Notification Service Initial Database Schema
-- Version: 1.0.0
-- Date: 2026-01-30

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Notification Templates Table
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  channel VARCHAR(50) NOT NULL,
  subject TEXT,
  body_template TEXT NOT NULL,
  locale VARCHAR(10) NOT NULL DEFAULT 'en',
  variables JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, slug, channel, locale)
);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  channel VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  frequency VARCHAR(50) NOT NULL DEFAULT 'realtime',
  quiet_hours_start VARCHAR(5),
  quiet_hours_end VARCHAR(5),
  timezone VARCHAR(100) NOT NULL DEFAULT 'Africa/Lagos',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id, channel)
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  channel VARCHAR(50) NOT NULL,
  template_id UUID REFERENCES notification_templates(id),
  subject TEXT,
  content TEXT NOT NULL,
  recipient VARCHAR(500) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Delivery Logs Table
CREATE TABLE IF NOT EXISTS delivery_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES notifications(id),
  channel VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  provider_response TEXT,
  provider_message_id VARCHAR(500),
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  bounced_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for Templates
CREATE INDEX IF NOT EXISTS idx_templates_tenant ON notification_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_templates_slug ON notification_templates(slug);
CREATE INDEX IF NOT EXISTS idx_templates_channel ON notification_templates(channel);
CREATE INDEX IF NOT EXISTS idx_templates_active ON notification_templates(is_active);

-- Indexes for User Preferences
CREATE INDEX IF NOT EXISTS idx_preferences_tenant_user ON user_preferences(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_preferences_channel ON user_preferences(channel);

-- Indexes for Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Indexes for Delivery Logs
CREATE INDEX IF NOT EXISTS idx_delivery_notification ON delivery_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_status ON delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_delivery_created ON delivery_logs(created_at);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_templates_updated_at ON notification_templates;
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Table Comments
COMMENT ON TABLE notification_templates IS 'Notification message templates with localization support';
COMMENT ON TABLE user_preferences IS 'User notification preferences per channel';
COMMENT ON TABLE notifications IS 'Notification queue and history';
COMMENT ON TABLE delivery_logs IS 'Delivery tracking and analytics logs';
