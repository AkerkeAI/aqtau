/**
 * AI-Powered Reply Suggestion Service
 *
 * Server-side service that uses Gemini to generate suggested replies
 * to organization responses. This prepares the architecture for future
 * two-way communication with organizations.
 */

import { getGeminiModel } from '@/lib/gemini-config';
import { SchemaType } from '@google/generative-ai';

/**
 * Conversation message
 */
export interface ConversationMessage {
  id: string;
  direction: 'outbound' | 'inbound';
  body: string;
  createdAt: string;
  actor?: string;
}

/**
 * Report data for reply generation
 */
export interface ReportForReply {
  id: string;
  category: string;
  description: string;
  address: string;
  status: string;
}

/**
 * Organization data for reply generation
 */
export interface OrganizationForReply {
  id: string;
  name: string;
  category: string;
}

/**
 * Generated reply suggestion
 */
export interface ReplySuggestion {
  message: string;
  language: string;
  suggestedActions?: string[];
}

/**
 * Generate a suggested reply to an organization response
 *
 * This function is called server-side only and creates a draft reply
 * based on the conversation history and report context.
 */
export async function generateReplySuggestion(
  report: ReportForReply,
  organization: OrganizationForReply,
  conversation: ConversationMessage[],
  latestInboundMessage: string
): Promise<ReplySuggestion | null> {
  const model = getGeminiModel();
  if (!model) {
    console.warn('Gemini not available - cannot generate reply suggestion');
    return null;
  }

  try {
    // Build the prompt with context
    const prompt = buildReplyPrompt(report, organization, conversation, latestInboundMessage);

    // Use structured JSON output
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            message: {
              type: SchemaType.STRING,
              description: 'The suggested reply message',
            },
            language: {
              type: SchemaType.STRING,
              description: 'Detected language code (e.g., ru, en, kk)',
            },
            suggestedActions: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.STRING,
              },
              description: 'Suggested actions for the operator to consider',
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
    const suggestion = JSON.parse(text) as ReplySuggestion;

    // Validate the result
    if (!isValidReplySuggestion(suggestion)) {
      console.error('Invalid reply suggestion from Gemini:', suggestion);
      return null;
    }

    return suggestion;
  } catch (error) {
    console.error('Error generating reply suggestion with Gemini:', error);
    return null;
  }
}

/**
 * Build the reply suggestion prompt
 */
function buildReplyPrompt(
  report: ReportForReply,
  organization: OrganizationForReply,
  conversation: ConversationMessage[],
  latestInboundMessage: string
): string {
  const reportIdShort = report.id.slice(0, 8);

  let prompt = `You are a municipal communication assistant for the city of Aktau, Kazakhstan.

Your task is to generate a suggested reply to an organization's response about a citizen report.

REPORT CONTEXT:
- Report ID: ${report.id}
- Short ID: ${reportIdShort}
- Category: ${report.category}
- Description: ${report.description}
- Address: ${report.address}
- Current Status: ${report.status}

ORGANIZATION:
- Name: ${organization.name}
- Category: ${organization.category}

LATEST INBOUND MESSAGE FROM ORGANIZATION:
${latestInboundMessage}

`;

  if (conversation.length > 0) {
    prompt += `CONVERSATION HISTORY:\n`;
    conversation.forEach((msg, index) => {
      const direction = msg.direction === 'outbound' ? '→ Outbound (to org)' : '← Inbound (from org)';
      prompt += `${index + 1}. ${direction} [${msg.createdAt}]: ${msg.body}\n`;
    });
    prompt += '\n';
  }

  prompt += `
REQUIREMENTS:
1. Generate a professional and polite draft reply
2. Acknowledge the organization's response
3. Keep it concise and relevant to the specific response
4. Use Russian language by default unless the conversation clearly requires another language
5. NEVER claim that municipal work has happened without actual data
6. NEVER promise deadlines that don't exist
7. NEVER change report status based only on an AI guess
8. Suggest appropriate actions for the operator to consider (if applicable)
9. Status changes must remain controlled by authenticated operators
10. Be helpful but conservative - operators should review before sending

Return your response as JSON with this exact structure:
{
  "message": "the suggested reply message",
  "language": "language code (e.g., ru, en, kk)",
  "suggestedActions": ["action 1", "action 2"] (optional)
}`;

  return prompt;
}

/**
 * Validate reply suggestion
 */
function isValidReplySuggestion(result: any): result is ReplySuggestion {
  return (
    result &&
    typeof result === 'object' &&
    typeof result.message === 'string' &&
    result.message.length > 0 &&
    typeof result.language === 'string' &&
    result.language.length > 0 &&
    (!result.suggestedActions || Array.isArray(result.suggestedActions))
  );
}

/**
 * Generate a fallback reply suggestion when AI is unavailable
 */
export function generateFallbackReplySuggestion(
  latestInboundMessage: string
): ReplySuggestion {
  return {
    message: `Спасибо за ответ. Мы рассмотрим информацию и примем соответствующие меры.`,
    language: 'ru',
    suggestedActions: [
      'Рассмотреть ответ организации',
      'Обновить статус обращения при необходимости',
      'Связаться с организацией для уточнения деталей',
    ],
  };
}
