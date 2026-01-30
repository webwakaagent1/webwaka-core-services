import { NotificationChannel, Notification } from '../models/types';
import { logger } from '../utils/logger';

export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  providerResponse?: string;
  errorMessage?: string;
}

export abstract class BaseProvider {
  protected channel: NotificationChannel;
  protected isConfigured: boolean = false;

  constructor(channel: NotificationChannel) {
    this.channel = channel;
  }

  abstract send(notification: Notification): Promise<SendResult>;
  
  abstract checkDeliveryStatus(providerMessageId: string): Promise<{
    status: 'pending' | 'delivered' | 'failed' | 'bounced';
    deliveredAt?: Date;
  }>;

  abstract validateRecipient(recipient: string): boolean;

  getChannel(): NotificationChannel {
    return this.channel;
  }

  isAvailable(): boolean {
    return this.isConfigured;
  }

  protected log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, any>): void {
    logger[level](`[${this.channel.toUpperCase()}] ${message}`, meta);
  }
}
