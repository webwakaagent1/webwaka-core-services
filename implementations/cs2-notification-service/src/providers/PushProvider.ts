import { BaseProvider, SendResult } from './BaseProvider';
import { Notification } from '../models/types';
import { logger } from '../utils/logger';

export class PushProvider extends BaseProvider {
  private provider: 'firebase' | 'onesignal' | 'mock';
  private serverKey?: string;
  private appId?: string;
  private apiKey?: string;

  constructor() {
    super('push');
    this.provider = (process.env.PUSH_PROVIDER as any) || 'mock';
    this.serverKey = process.env.FIREBASE_SERVER_KEY;
    this.appId = process.env.ONESIGNAL_APP_ID;
    this.apiKey = process.env.ONESIGNAL_API_KEY;

    if (this.provider === 'firebase' && this.serverKey) {
      this.isConfigured = true;
      this.log('info', 'Push provider configured with Firebase');
    } else if (this.provider === 'onesignal' && this.appId && this.apiKey) {
      this.isConfigured = true;
      this.log('info', 'Push provider configured with OneSignal');
    } else {
      this.provider = 'mock';
      this.isConfigured = true;
      this.log('warn', 'Push provider using mock mode - no real push notifications will be sent');
    }
  }

  async send(notification: Notification): Promise<SendResult> {
    if (this.provider === 'mock') {
      this.log('info', 'Mock push notification sent', {
        notificationId: notification.id,
        recipient: notification.recipient,
        title: notification.subject,
      });
      return {
        success: true,
        providerMessageId: `mock-push-${Date.now()}`,
        providerResponse: 'Mock push provider - message logged only',
      };
    }

    try {
      let result: SendResult;

      switch (this.provider) {
        case 'firebase':
          result = await this.sendViaFirebase(notification);
          break;
        case 'onesignal':
          result = await this.sendViaOneSignal(notification);
          break;
        default:
          result = { success: false, errorMessage: 'Unknown push provider' };
      }

      return result;
    } catch (error: any) {
      this.log('error', 'Failed to send push notification', {
        notificationId: notification.id,
        error: error.message,
      });
      return { success: false, errorMessage: error.message };
    }
  }

  private async sendViaFirebase(notification: Notification): Promise<SendResult> {
    const url = 'https://fcm.googleapis.com/fcm/send';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `key=${this.serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: notification.recipient,
        notification: {
          title: notification.subject || 'WebWaka Notification',
          body: notification.content,
        },
        data: notification.metadata,
      }),
    });

    const data = await response.json() as any;

    if (data.success === 1) {
      return {
        success: true,
        providerMessageId: data.results?.[0]?.message_id,
        providerResponse: JSON.stringify(data),
      };
    } else {
      return {
        success: false,
        errorMessage: data.results?.[0]?.error || 'Firebase error',
      };
    }
  }

  private async sendViaOneSignal(notification: Notification): Promise<SendResult> {
    const url = 'https://onesignal.com/api/v1/notifications';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: this.appId,
        include_player_ids: [notification.recipient],
        headings: { en: notification.subject || 'WebWaka Notification' },
        contents: { en: notification.content },
        data: notification.metadata,
      }),
    });

    const data = await response.json() as any;

    if (data.id) {
      return {
        success: true,
        providerMessageId: data.id,
        providerResponse: JSON.stringify(data),
      };
    } else {
      return {
        success: false,
        errorMessage: data.errors?.[0] || 'OneSignal error',
      };
    }
  }

  async checkDeliveryStatus(providerMessageId: string): Promise<{
    status: 'pending' | 'delivered' | 'failed' | 'bounced';
    deliveredAt?: Date;
  }> {
    return { status: 'delivered', deliveredAt: new Date() };
  }

  validateRecipient(recipient: string): boolean {
    return recipient.length > 0;
  }
}

export const pushProvider = new PushProvider();
