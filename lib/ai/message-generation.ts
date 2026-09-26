/**
 * AI-Powered Message Generation Service
 *
 * Server-side service that uses Gemini to generate professional messages
 * for responsible organizations based on report details.
 */

import { getGeminiModel, CATEGORY_LABELS } from '@/lib/gemini-config';
import { SchemaType } from '@google/generative-ai';

/**
 * Report data for message generation
 */
export interface ReportForMessage {
  id: string;
  category: string;
  aiCategory?: string;
  description: string;
  address: string;
  latitude?: number;
  longitude?: number;
  photoUrl?: string;
  createdAt: string;
}

/**
 * Organization data for message generation
 */
export interface OrganizationForMessage {
  id: string;
  name: string;
  category: string;
  channel: string;
  destination: string;
}

/**
 * Generated message result
 */
export interface GeneratedMessage {
  subject?: string;
  message: string;
  language: string;
}

/**
 * Generate a professional message for an organization
 *
 * This function is called server-side only and creates a concise,
 * professional message based only on the actual report data.
 */
export async function generateOrganizationMessage(
  report: ReportForMessage,
  organization: OrganizationForMessage
): Promise<GeneratedMessage | null> {
  const model = getGeminiModel();
  if (!model) {
    console.warn('Gemini not available - cannot generate message');
    return null;
  }

  try {
    // Build the prompt with context
    const prompt = buildMessagePrompt(report, organization);

    // Use structured JSON output
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            subject: {
              type: SchemaType.STRING,
              description: 'Email subject (only for email channel)',
            },
            message: {
              type: SchemaType.STRING,
              description: 'The message body',
            },
            language: {
              type: SchemaType.STRING,
              description: 'Detected language code (e.g., ru, en, kk)',
            },
          },
          required: ['message', 'language'],
        },
      },
    });

    const response = result.response;
    const text = response.text();

    if (!text) {
      console.error('Gemini returned empty response');
      return null;
    }

    // Parse JSON response
    const generated = JSON.parse(text) as GeneratedMessage;

    // Validate the result
    if (!isValidGeneratedMessage(generated)) {
      console.error('Invalid generated message from Gemini:', generated);
      return null;
    }

    // Only include subject for email channel
    if (organization.channel !== 'email') {
      generated.subject = undefined;
    }

    return generated;
  } catch (error) {
    console.error('Error generating message with Gemini:', error);
    return null;
  }
}

/**
 * Build the message generation prompt
 */
function buildMessagePrompt(
  report: ReportForMessage,
  organization: OrganizationForMessage
): string {
  const categoryLabel = report.aiCategory 
    ? CATEGORY_LABELS[report.aiCategory] 
    : CATEGORY_LABELS[report.category];
  
  const reportIdShort = report.id.slice(0, 8);
  const isEmail = organization.channel === 'email';

  let prompt = `You are a municipal communication assistant for the city of Aktau, Kazakhstan.

Your task is to generate a professional message to a responsible organization about a citizen report.

RECIPIENT ORGANIZATION:
- Name: ${organization.name}
- Category: ${organization.category}
- Communication Channel: ${organization.channel}

REPORT DETAILS:
- Report ID: ${report.id}
- Short ID: ${reportIdShort}
- Category: ${categoryLabel}
- Description: ${report.description}
- Address: ${report.address}
`;

  if (report.latitude && report.longitude) {
    prompt += `- Coordinates: ${report.latitude}, ${report.longitude}\n`;
  }

  if (report.photoUrl) {
    prompt += `- Photo: Available\n`;
  }

  prompt += `- Created: ${report.createdAt}

`;
  
  if (isEmail) {
    prompt += `MESSAGE FORMAT: Email
- Include a professional subject line
- Use formal but clear language
- Be concise but complete
`;
  } else {
    prompt += `MESSAGE FORMAT: ${organization.channel.charAt(0).toUpperCase() + organization.channel.slice(1)}
- Be conversational but professional
- Keep it shorter and more direct
- Use appropriate formatting for the platform
`;
  }

  prompt += `
REQUIREMENTS:
1. Be concise and professional
2. Describe ONLY facts from the report - do not invent information
3. Clearly identify the location (address)
4. Explain the reported problem based on the description
5. Politely request review and action
6. Include the Aýan report ID (${reportIdShort}) for reference
7. Use Russian language by default unless the report clearly requires another language
8. For email: include a professional subject line
9. For messaging apps: be more conversational and direct
10. Never promise deadlines or make commitments on behalf of the organization

Return your response as JSON with this exact structure:
{
  "subject": "professional subject line (only for email)",
  "message": "the message body",
  "language": "language code (e.g., ru, en, kk)"
}`;

  return prompt;
}

/**
 * Validate generated message
 */
function isValidGeneratedMessage(result: any): result is GeneratedMessage {
  return (
    result &&
    typeof result === 'object' &&
    typeof result.message === 'string' &&
    result.message.length > 0 &&
    typeof result.language === 'string' &&
    result.language.length > 0
  );
}

/**
 * Generate a fallback message when AI is unavailable
 */
export function generateFallbackMessage(
  report: ReportForMessage,
  organization: OrganizationForMessage
): GeneratedMessage {
  const categoryLabel = report.aiCategory 
    ? CATEGORY_LABELS[report.aiCategory] 
    : CATEGORY_LABELS[report.category];
  
  const reportIdShort = report.id.slice(0, 8);
  const isEmail = organization.channel === 'email';

  const messageBody = `Здравствуйте, коллеги из ${organization.name}.

Поступило обращение через платформу Aýan:

Категория: ${categoryLabel}
Адрес: ${report.address}
Описание: ${report.description}
ID обращения: ${reportIdShort}

Просим рассмотреть обращение и принять меры по решению проблемы.

С уважением,
Команда Aýan`;

  const generated: GeneratedMessage = {
    message: messageBody,
    language: 'ru',
  };

  if (isEmail) {
    generated.subject = `Обращение #${reportIdShort} - ${categoryLabel} - Aýan`;
  }

  return generated;
}
