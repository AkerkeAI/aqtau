/**
 * Messaging Provider Abstraction
 *
 * This interface defines the contract for all messaging providers.
 * New providers (WhatsApp, Telegram, Email, etc.) can be added by implementing
 * this interface without changing the core application logic.
 */

export interface MessageProvider {
  /**
   * Provider identifier (e.g., 'whatsapp', 'telegram', 'email')
   */
  readonly providerId: string;

  /**
   * Provider display name
   */
  readonly providerName: string;

  /**
   * Validate destination format for this provider
   */
  validateDestination(destination: string): boolean;

  /**
   * Format message for this provider's specific requirements
   */
  formatMessage(message: OutboundMessage): FormattedMessage;

  /**
   * Send message (not implemented in MVP - for future use)
   */
  sendMessage?(message: OutboundMessage): Promise<SendResult>;
}

export interface OutboundMessage {
  reportId: string;
  organizationId: string;
  organizationName: string;
  channel: string;
  destination: string;
  subject?: string;
  body: string;
  language?: string;
}

export interface InboundMessage {
  providerMessageId: string;
  reportId: string;
  organizationId: string;
  channel: string;
  body: string;
  receivedAt: Date;
  metadata?: Record<string, any>;
}

export interface FormattedMessage {
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
}

export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  deliveredAt?: Date;
}

/**
 * Base class for message providers with common functionality
 */
export abstract class BaseMessageProvider implements MessageProvider {
  abstract readonly providerId: string;
  abstract readonly providerName: string;

  abstract validateDestination(destination: string): boolean;
  abstract formatMessage(message: OutboundMessage): FormattedMessage;

  /**
   * Default send implementation - not implemented in MVP
   */
  async sendMessage(message: OutboundMessage): Promise<SendResult> {
    return {
      success: false,
      error: `${this.providerName} provider not yet implemented`,
    };
  }
}

/**
 * WhatsApp Provider (placeholder for future implementation)
 */
export class WhatsAppProvider extends BaseMessageProvider {
  readonly providerId = 'whatsapp';
  readonly providerName = 'WhatsApp';

  validateDestination(destination: string): boolean {
    // Basic phone number validation (international format)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(destination.replace(/[\s\-\(\)]/g, ''));
  }

  formatMessage(message: OutboundMessage): FormattedMessage {
    // WhatsApp messages are typically shorter and more conversational
    return {
      body: this.formatWhatsAppMessage(message),
    };
  }

  private formatWhatsAppMessage(message: OutboundMessage): string {
    const lines = [
      `📋 *Обращение #${message.reportId.slice(0, 8)}*`,
      '',
      message.body,
      '',
      `Отправлено через AqTau`,
    ];
    return lines.join('\n');
  }
}

/**
 * Telegram Provider (placeholder for future implementation)
 */
export class TelegramProvider extends BaseMessageProvider {
  readonly providerId = 'telegram';
  readonly providerName = 'Telegram';

  validateDestination(destination: string): boolean {
    // Telegram username or chat ID validation
    const usernameRegex = /^@?[a-zA-Z0-9_]{5,32}$/;
    const chatIdRegex = /^-?\d+$/;
    return usernameRegex.test(destination) || chatIdRegex.test(destination);
  }

  formatMessage(message: OutboundMessage): FormattedMessage {
    // Telegram messages support Markdown
    return {
      body: this.formatTelegramMessage(message),
    };
  }

  private formatTelegramMessage(message: OutboundMessage): string {
    const lines = [
      `📋 *Обращение #${message.reportId.slice(0, 8)}*`,
      '',
      message.body,
      '',
      `Отправлено через AqTau`,
    ];
    return lines.join('\n');
  }
}

/**
 * Email Provider (placeholder for future implementation)
 */
export class EmailProvider extends BaseMessageProvider {
  readonly providerId = 'email';
  readonly providerName = 'Email';

  validateDestination(destination: string): boolean {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(destination);
  }

  formatMessage(message: OutboundMessage): FormattedMessage {
    // Email messages have subject and can be more formal
    return {
      subject: message.subject || `Обращение #${message.reportId.slice(0, 8)} - AqTau`,
      body: this.formatEmailMessage(message),
    };
  }

  private formatEmailMessage(message: OutboundMessage): string {
    const lines = [
      `Уважаемые коллеги из ${message.organizationName},`,
      '',
      message.body,
      '',
      `--`,
      `AqTau - Цифровая платформа для жителей Актау`,
      `ID обращения: ${message.reportId}`,
    ];
    return lines.join('\n');
  }
}

/**
 * Web Provider (placeholder for future implementation)
 */
export class WebProvider extends BaseMessageProvider {
  readonly providerId = 'web';
  readonly providerName = 'Web';

  validateDestination(destination: string): boolean {
    // Basic URL validation
    try {
      new URL(destination);
      return true;
    } catch {
      return false;
    }
  }

  formatMessage(message: OutboundMessage): FormattedMessage {
    return {
      body: message.body,
      metadata: {
        reportId: message.reportId,
        organizationId: message.organizationId,
      },
    };
  }
}

/**
 * API Provider (placeholder for future implementation)
 */
export class APIProvider extends BaseMessageProvider {
  readonly providerId = 'api';
  readonly providerName = 'API';

  validateDestination(destination: string): boolean {
    // API endpoint validation - basic check for non-empty string
    return destination.length > 0;
  }

  formatMessage(message: OutboundMessage): FormattedMessage {
    return {
      body: message.body,
      metadata: {
        endpoint: message.destination,
        reportId: message.reportId,
        organizationId: message.organizationId,
      },
    };
  }
}

/**
 * Provider factory - get the appropriate provider for a channel
 */
export function getProvider(channel: string): MessageProvider {
  switch (channel) {
    case 'whatsapp':
      return new WhatsAppProvider();
    case 'telegram':
      return new TelegramProvider();
    case 'email':
      return new EmailProvider();
    case 'web':
      return new WebProvider();
    case 'api':
      return new APIProvider();
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }
}

/**
 * Get all available providers
 */
export function getAllProviders(): MessageProvider[] {
  return [
    new WhatsAppProvider(),
    new TelegramProvider(),
    new EmailProvider(),
    new WebProvider(),
    new APIProvider(),
  ];
}
