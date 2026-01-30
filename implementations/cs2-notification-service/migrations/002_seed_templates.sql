-- CS-2 Notification Service - Standard Templates Seed
-- Version: 1.0.0
-- Date: 2026-01-30

-- Insert 5 standard templates for the 'system' tenant (available to all tenants as fallback)

-- 1. Welcome Email Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'Welcome Email',
  'welcome',
  'email',
  'Welcome to {{companyName}}!',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #2563eb;">Welcome to {{companyName}}!</h1>
  <p>Hello {{userName}},</p>
  <p>Thank you for joining us. We''re excited to have you on board!</p>
  <p>Here are some things you can do to get started:</p>
  <ul>
    <li>Complete your profile</li>
    <li>Explore our features</li>
    <li>Connect with our community</li>
  </ul>
  <p>If you have any questions, feel free to reach out to our support team.</p>
  <p>Best regards,<br/>The {{companyName}} Team</p>
</div>',
  'en',
  '["userName", "companyName"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 1b. Welcome SMS Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'Welcome SMS',
  'welcome',
  'sms',
  NULL,
  'Welcome to {{companyName}}, {{userName}}! We''re excited to have you. Get started at {{appUrl}}',
  'en',
  '["userName", "companyName", "appUrl"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 2. Password Reset Email Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'Password Reset Email',
  'password-reset',
  'email',
  'Reset Your Password - {{companyName}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #2563eb;">Password Reset Request</h1>
  <p>Hello {{userName}},</p>
  <p>We received a request to reset your password. Click the button below to create a new password:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{{resetLink}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
  </p>
  <p>This link will expire in {{expiryHours}} hours.</p>
  <p>If you didn''t request this, you can safely ignore this email.</p>
  <p>Best regards,<br/>The {{companyName}} Team</p>
</div>',
  'en',
  '["userName", "companyName", "resetLink", "expiryHours"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 2b. Password Reset SMS Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'Password Reset SMS',
  'password-reset',
  'sms',
  NULL,
  'Your {{companyName}} password reset code is: {{resetCode}}. Valid for {{expiryMinutes}} minutes.',
  'en',
  '["companyName", "resetCode", "expiryMinutes"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 3. Order Confirmation Email Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'Order Confirmation Email',
  'order-confirmation',
  'email',
  'Order Confirmed - #{{orderNumber}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #16a34a;">Order Confirmed!</h1>
  <p>Hello {{userName}},</p>
  <p>Thank you for your order. Here are your order details:</p>
  <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Order Number:</strong> #{{orderNumber}}</p>
    <p><strong>Order Date:</strong> {{formatDate orderDate}}</p>
    <p><strong>Total Amount:</strong> {{formatCurrency totalAmount currency}}</p>
  </div>
  {{#if items}}
  <h3>Items Ordered:</h3>
  <ul>
    {{#each items}}
    <li>{{this.name}} x {{this.quantity}} - {{formatCurrency this.price currency}}</li>
    {{/each}}
  </ul>
  {{/if}}
  <p>You can track your order status at: <a href="{{trackingUrl}}">{{trackingUrl}}</a></p>
  <p>Best regards,<br/>The {{companyName}} Team</p>
</div>',
  'en',
  '["userName", "orderNumber", "orderDate", "totalAmount", "currency", "items", "trackingUrl", "companyName"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 3b. Order Confirmation SMS Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'Order Confirmation SMS',
  'order-confirmation',
  'sms',
  NULL,
  'Order #{{orderNumber}} confirmed! Total: {{formatCurrency totalAmount currency}}. Track at: {{trackingUrl}}',
  'en',
  '["orderNumber", "totalAmount", "currency", "trackingUrl"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 4. Payment Receipt Email Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'Payment Receipt Email',
  'payment-receipt',
  'email',
  'Payment Receipt - {{formatCurrency amount currency}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #16a34a;">Payment Received</h1>
  <p>Hello {{userName}},</p>
  <p>We have received your payment. Here are the details:</p>
  <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Transaction ID:</strong> {{transactionId}}</p>
    <p><strong>Amount:</strong> {{formatCurrency amount currency}}</p>
    <p><strong>Payment Method:</strong> {{paymentMethod}}</p>
    <p><strong>Date:</strong> {{formatDate paymentDate}}</p>
    {{#if description}}
    <p><strong>Description:</strong> {{description}}</p>
    {{/if}}
  </div>
  <p>This is your official receipt for this transaction.</p>
  <p>If you have any questions, please contact our support team.</p>
  <p>Best regards,<br/>The {{companyName}} Team</p>
</div>',
  'en',
  '["userName", "transactionId", "amount", "currency", "paymentMethod", "paymentDate", "description", "companyName"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 4b. Payment Receipt SMS Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'Payment Receipt SMS',
  'payment-receipt',
  'sms',
  NULL,
  'Payment of {{formatCurrency amount currency}} received. Transaction ID: {{transactionId}}. Thank you!',
  'en',
  '["amount", "currency", "transactionId"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 5. System Alert Email Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'System Alert Email',
  'system-alert',
  'email',
  '[{{alertLevel}}] {{alertTitle}} - {{companyName}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: {{#if (eq alertLevel "critical")}}#dc2626{{else if (eq alertLevel "warning")}}#f59e0b{{else}}#2563eb{{/if}}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0;">{{uppercase alertLevel}}: {{alertTitle}}</h1>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <p><strong>Time:</strong> {{formatDate alertTime}}</p>
    <p><strong>Service:</strong> {{serviceName}}</p>
    <p><strong>Details:</strong></p>
    <p>{{alertMessage}}</p>
    {{#if actionRequired}}
    <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <strong>Action Required:</strong> {{actionRequired}}
    </div>
    {{/if}}
    {{#if dashboardUrl}}
    <p><a href="{{dashboardUrl}}" style="color: #2563eb;">View in Dashboard</a></p>
    {{/if}}
  </div>
</div>',
  'en',
  '["alertLevel", "alertTitle", "alertTime", "serviceName", "alertMessage", "actionRequired", "dashboardUrl", "companyName"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 5b. System Alert SMS Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'System Alert SMS',
  'system-alert',
  'sms',
  NULL,
  '[{{uppercase alertLevel}}] {{alertTitle}}: {{alertMessage}}',
  'en',
  '["alertLevel", "alertTitle", "alertMessage"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;

-- 5c. System Alert Push Template
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
VALUES (
  'system',
  'System Alert Push',
  'system-alert',
  'push',
  '{{uppercase alertLevel}}: {{alertTitle}}',
  '{{alertMessage}}',
  'en',
  '["alertLevel", "alertTitle", "alertMessage"]',
  true,
  '{}'
) ON CONFLICT (tenant_id, slug, channel, locale) DO NOTHING;
