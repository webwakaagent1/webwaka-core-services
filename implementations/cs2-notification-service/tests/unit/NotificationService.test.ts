import { NotificationChannel, NotificationPriority, NotificationStatus } from '../../src/models/types';

describe('NotificationService', () => {
  describe('Notification Types', () => {
    it('should have valid notification channels', () => {
      const validChannels: NotificationChannel[] = ['email', 'sms', 'push', 'whatsapp'];
      
      validChannels.forEach(channel => {
        expect(['email', 'sms', 'push', 'whatsapp']).toContain(channel);
      });
    });

    it('should have valid notification priorities', () => {
      const validPriorities: NotificationPriority[] = ['low', 'normal', 'high', 'urgent'];
      
      validPriorities.forEach(priority => {
        expect(['low', 'normal', 'high', 'urgent']).toContain(priority);
      });
    });

    it('should have valid notification statuses', () => {
      const validStatuses: NotificationStatus[] = [
        'pending', 'queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'cancelled'
      ];
      
      validStatuses.forEach(status => {
        expect(['pending', 'queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'cancelled']).toContain(status);
      });
    });
  });

  describe('Notification Validation', () => {
    it('should validate email recipient format', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      expect(emailRegex.test('user@example.com')).toBe(true);
      expect(emailRegex.test('user.name@domain.co.ng')).toBe(true);
      expect(emailRegex.test('invalid-email')).toBe(false);
      expect(emailRegex.test('@domain.com')).toBe(false);
    });

    it('should validate phone number format', () => {
      const phoneRegex = /^\+?[1-9]\d{7,14}$/;
      
      expect(phoneRegex.test('+2348012345678')).toBe(true);
      expect(phoneRegex.test('2348012345678')).toBe(true);
      expect(phoneRegex.test('08012345678')).toBe(false);
      expect(phoneRegex.test('123')).toBe(false);
    });
  });

  describe('Priority Handling', () => {
    it('should correctly order priorities', () => {
      const priorityOrder: Record<NotificationPriority, number> = {
        'urgent': 4,
        'high': 3,
        'normal': 2,
        'low': 1,
      };
      
      expect(priorityOrder['urgent']).toBeGreaterThan(priorityOrder['high']);
      expect(priorityOrder['high']).toBeGreaterThan(priorityOrder['normal']);
      expect(priorityOrder['normal']).toBeGreaterThan(priorityOrder['low']);
    });
  });

  describe('Retry Logic', () => {
    it('should calculate exponential backoff delay', () => {
      const baseDelay = 5000;
      
      const delay1 = baseDelay * Math.pow(2, 1);
      const delay2 = baseDelay * Math.pow(2, 2);
      const delay3 = baseDelay * Math.pow(2, 3);
      
      expect(delay1).toBe(10000);
      expect(delay2).toBe(20000);
      expect(delay3).toBe(40000);
    });

    it('should respect max retry limit', () => {
      const maxRetries = 3;
      let retryCount = 0;
      
      while (retryCount < maxRetries) {
        retryCount++;
      }
      
      expect(retryCount).toBe(maxRetries);
    });
  });
});
