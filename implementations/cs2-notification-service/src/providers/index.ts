import { NotificationChannel } from '../models/types';
import { BaseProvider } from './BaseProvider';
import { emailProvider } from './EmailProvider';
import { smsProvider } from './SmsProvider';
import { pushProvider } from './PushProvider';

export { BaseProvider, SendResult } from './BaseProvider';
export { EmailProvider, emailProvider } from './EmailProvider';
export { SmsProvider, smsProvider } from './SmsProvider';
export { PushProvider, pushProvider } from './PushProvider';

const providers: Record<NotificationChannel, BaseProvider | null> = {
  email: emailProvider,
  sms: smsProvider,
  push: pushProvider,
  whatsapp: null,
};

export function getProvider(channel: NotificationChannel): BaseProvider | null {
  return providers[channel] || null;
}

export function getAvailableChannels(): NotificationChannel[] {
  return (Object.entries(providers) as [NotificationChannel, BaseProvider | null][])
    .filter(([_, provider]) => provider?.isAvailable())
    .map(([channel]) => channel);
}
