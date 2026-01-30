export type NotificationChannel = 'email' | 'sms' | 'push' | 'whatsapp';

export type NotificationStatus = 
  | 'pending'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'cancelled';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  tenantId: string;
  userId?: string;
  channel: NotificationChannel;
  templateId?: string;
  subject?: string;
  content: string;
  recipient: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  metadata: Record<string, any>;
  scheduledAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationInput {
  tenantId: string;
  userId?: string;
  channel: NotificationChannel;
  templateId?: string;
  templateData?: Record<string, any>;
  subject?: string;
  content?: string;
  recipient: string;
  priority?: NotificationPriority;
  metadata?: Record<string, any>;
  scheduledAt?: Date;
}

export interface NotificationTemplate {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  channel: NotificationChannel;
  subject?: string;
  bodyTemplate: string;
  locale: string;
  variables: string[];
  isActive: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateInput {
  tenantId: string;
  name: string;
  slug: string;
  channel: NotificationChannel;
  subject?: string;
  bodyTemplate: string;
  locale?: string;
  variables?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateTemplateInput {
  name?: string;
  subject?: string;
  bodyTemplate?: string;
  locale?: string;
  variables?: string[];
  isActive?: boolean;
  metadata?: Record<string, any>;
}

export interface UserPreference {
  id: string;
  tenantId: string;
  userId: string;
  channel: NotificationChannel;
  enabled: boolean;
  frequency: 'realtime' | 'daily' | 'weekly' | 'never';
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserPreferenceInput {
  tenantId: string;
  userId: string;
  channel: NotificationChannel;
  enabled?: boolean;
  frequency?: 'realtime' | 'daily' | 'weekly' | 'never';
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone?: string;
  metadata?: Record<string, any>;
}

export interface UpdateUserPreferenceInput {
  enabled?: boolean;
  frequency?: 'realtime' | 'daily' | 'weekly' | 'never';
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone?: string;
  metadata?: Record<string, any>;
}

export interface DeliveryLog {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  providerResponse?: string;
  providerMessageId?: string;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  bouncedAt?: Date;
  errorMessage?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface NotificationFilter {
  tenantId?: string;
  userId?: string;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  priority?: NotificationPriority;
  startDate?: Date;
  endDate?: Date;
}

export interface NotificationStats {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  failed: number;
  openRate?: number;
  clickRate?: number;
}

export interface ProviderConfig {
  email?: {
    provider: 'smtp' | 'sendgrid' | 'ses' | 'mailgun';
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    apiKey?: string;
    fromAddress: string;
    fromName: string;
  };
  sms?: {
    provider: 'twilio' | 'africastalking' | 'termii';
    accountSid?: string;
    authToken?: string;
    apiKey?: string;
    senderId: string;
  };
  push?: {
    provider: 'firebase' | 'onesignal';
    serverKey?: string;
    apiKey?: string;
    appId?: string;
  };
  whatsapp?: {
    provider: 'twilio' | 'infobip' | 'meta';
    accountSid?: string;
    authToken?: string;
    phoneNumber: string;
  };
}
