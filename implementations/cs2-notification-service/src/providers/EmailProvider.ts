import nodemailer, { Transporter } from 'nodemailer';
import { BaseProvider, SendResult } from './BaseProvider';
import { Notification } from '../models/types';
import { logger } from '../utils/logger';

export class EmailProvider extends BaseProvider {
  private transporter: Transporter | null = null;
  private fromAddress: string;
  private fromName: string;

  constructor() {
    super('email');
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply@webwaka.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'WebWaka';
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.isConfigured = true;
      this.log('info', 'Email provider configured with SMTP');
    } else {
      this.log('warn', 'Email provider not configured - SMTP settings missing');
      if (process.env.NODE_ENV === 'development') {
        this.transporter = nodemailer.createTransport({
          host: 'localhost',
          port: 1025,
          ignoreTLS: true,
        });
        this.isConfigured = true;
        this.log('info', 'Using development mail server (localhost:1025)');
      }
    }
  }

  async send(notification: Notification): Promise<SendResult> {
    if (!this.transporter) {
      return {
        success: false,
        errorMessage: 'Email provider not configured',
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to: notification.recipient,
        subject: notification.subject || 'Notification from WebWaka',
        html: notification.content,
        text: this.stripHtml(notification.content),
      });

      this.log('info', 'Email sent successfully', {
        notificationId: notification.id,
        messageId: info.messageId,
        recipient: notification.recipient,
      });

      return {
        success: true,
        providerMessageId: info.messageId,
        providerResponse: JSON.stringify(info),
      };
    } catch (error: any) {
      this.log('error', 'Failed to send email', {
        notificationId: notification.id,
        error: error.message,
      });

      return {
        success: false,
        errorMessage: error.message,
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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(recipient);
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }
}

export const emailProvider = new EmailProvider();
