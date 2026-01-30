import { BaseProvider, SendResult } from './BaseProvider';
import { Notification } from '../models/types';
import { logger } from '../utils/logger';

export class SmsProvider extends BaseProvider {
  private provider: 'twilio' | 'africastalking' | 'termii' | 'mock';
  private senderId: string;
  private apiKey?: string;
  private accountSid?: string;
  private authToken?: string;

  constructor() {
    super('sms');
    this.provider = (process.env.SMS_PROVIDER as any) || 'mock';
    this.senderId = process.env.SMS_SENDER_ID || 'WebWaka';
    this.apiKey = process.env.SMS_API_KEY;
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;

    if (this.provider === 'twilio' && this.accountSid && this.authToken) {
      this.isConfigured = true;
      this.log('info', 'SMS provider configured with Twilio');
    } else if (this.provider === 'africastalking' && this.apiKey) {
      this.isConfigured = true;
      this.log('info', 'SMS provider configured with Africa\'s Talking');
    } else if (this.provider === 'termii' && this.apiKey) {
      this.isConfigured = true;
      this.log('info', 'SMS provider configured with Termii');
    } else {
      this.provider = 'mock';
      this.isConfigured = true;
      this.log('warn', 'SMS provider using mock mode - no real SMS will be sent');
    }
  }

  async send(notification: Notification): Promise<SendResult> {
    if (this.provider === 'mock') {
      this.log('info', 'Mock SMS sent', {
        notificationId: notification.id,
        recipient: notification.recipient,
        content: notification.content.substring(0, 50),
      });
      return {
        success: true,
        providerMessageId: `mock-${Date.now()}`,
        providerResponse: 'Mock SMS provider - message logged only',
      };
    }

    try {
      let result: SendResult;

      switch (this.provider) {
        case 'twilio':
          result = await this.sendViaTwilio(notification);
          break;
        case 'africastalking':
          result = await this.sendViaAfricasTalking(notification);
          break;
        case 'termii':
          result = await this.sendViaTermii(notification);
          break;
        default:
          result = { success: false, errorMessage: 'Unknown SMS provider' };
      }

      return result;
    } catch (error: any) {
      this.log('error', 'Failed to send SMS', {
        notificationId: notification.id,
        error: error.message,
      });
      return { success: false, errorMessage: error.message };
    }
  }

  private async sendViaTwilio(notification: Notification): Promise<SendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: notification.recipient,
      From: this.senderId,
      Body: notification.content,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const data = await response.json() as any;

    if (response.ok) {
      return {
        success: true,
        providerMessageId: data.sid,
        providerResponse: JSON.stringify(data),
      };
    } else {
      return {
        success: false,
        errorMessage: data.message || 'Twilio error',
      };
    }
  }

  private async sendViaAfricasTalking(notification: Notification): Promise<SendResult> {
    const url = 'https://api.africastalking.com/version1/messaging';
    const body = new URLSearchParams({
      username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
      to: notification.recipient,
      message: notification.content,
      from: this.senderId,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apiKey': this.apiKey!,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body,
    });

    const data = await response.json() as any;

    if (data.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
      return {
        success: true,
        providerMessageId: data.SMSMessageData.Recipients[0].messageId,
        providerResponse: JSON.stringify(data),
      };
    } else {
      return {
        success: false,
        errorMessage: data.SMSMessageData?.Message || 'Africa\'s Talking error',
      };
    }
  }

  private async sendViaTermii(notification: Notification): Promise<SendResult> {
    const url = 'https://api.ng.termii.com/api/sms/send';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: notification.recipient,
        from: this.senderId,
        sms: notification.content,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey,
      }),
    });

    const data = await response.json() as any;

    if (data.code === 'ok') {
      return {
        success: true,
        providerMessageId: data.message_id,
        providerResponse: JSON.stringify(data),
      };
    } else {
      return {
        success: false,
        errorMessage: data.message || 'Termii error',
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
    const phoneRegex = /^\+?[1-9]\d{7,14}$/;
    return phoneRegex.test(recipient.replace(/[\s-]/g, ''));
  }
}

export const smsProvider = new SmsProvider();
