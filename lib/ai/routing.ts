/**
 * AI-Powered Report Routing Service
 *
 * Server-side service that uses Gemini to classify reports when citizens
 * select "Другое" (other) category. This helps route reports to the correct
 * responsible organization automatically.
 */

import { getGeminiModel, SUPPORTED_CATEGORIES, CATEGORY_LABELS } from '@/lib/gemini-config';
import { SchemaType } from '@google/generative-ai';

/**
 * Result from AI classification
 */
export interface ClassificationResult {
  category: string;
  confidence: number;
  reason: string;
}

/**
 * Input for AI classification
 */
export interface ClassificationInput {
  description: string;
  address?: string;
  photoUrl?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Minimum confidence threshold for automatic routing
 */
const MIN_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Classify a report using Gemini AI
 *
 * This function is called server-side only and uses structured JSON output
 * to ensure Gemini returns valid categories from our supported list.
 */
export async function classifyReport(input: ClassificationInput): Promise<ClassificationResult | null> {
  const model = getGeminiModel();
  if (!model) {
    console.warn('Gemini not available - cannot classify report');
    return null;
  }

  try {
    // Build the prompt with context
    const prompt = buildClassificationPrompt(input);

    // Use structured JSON output
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            category: {
              type: SchemaType.STRING,
              format: 'enum',
              enum: [...SUPPORTED_CATEGORIES],
              description: 'The most appropriate category for this report',
            },
            confidence: {
              type: SchemaType.NUMBER,
              description: 'Confidence score from 0 to 1',
            },
            reason: {
              type: SchemaType.STRING,
              description: 'Brief explanation of why this category was chosen',
            },
          },
          required: ['category', 'confidence', 'reason'],
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
    const classification = JSON.parse(text) as ClassificationResult;

    // Validate the result
    if (!isValidClassification(classification)) {
      console.error('Invalid classification from Gemini:', classification);
      return null;
    }

    // Only return if confidence is above threshold
    if (classification.confidence < MIN_CONFIDENCE_THRESHOLD) {
      console.log(`Classification confidence too low: ${classification.confidence}`);
      return null;
    }

    return classification;
  } catch (error) {
    console.error('Error classifying report with Gemini:', error);
    return null;
  }
}

/**
 * Build the classification prompt
 */
function buildClassificationPrompt(input: ClassificationInput): string {
  const categoriesList = SUPPORTED_CATEGORIES
    .map(cat => `- ${cat}: ${CATEGORY_LABELS[cat]}`)
    .join('\n');

  let prompt = `You are a municipal report classification system for the city of Aktau, Kazakhstan.

Your task is to classify citizen reports into one of the following categories:

${categoriesList}

Analyze the following report and determine the most appropriate category:

`;
  
  if (input.description) {
    prompt += `Description: ${input.description}\n`;
  }
  
  if (input.address) {
    prompt += `Address: ${input.address}\n`;
  }
  
  if (input.latitude && input.longitude) {
    prompt += `Location: ${input.latitude}, ${input.longitude}\n`;
  }
  
  if (input.photoUrl) {
    prompt += `Photo available: Yes\n`;
  }

  prompt += `
Rules:
1. Choose ONLY from the provided categories
2. Return a confidence score between 0 and 1
3. Provide a brief reason for your choice
4. If the report is unclear or doesn't fit any category well, return a low confidence score
5. Consider the context - location, description, and any available photos
6. Be precise and conservative - it's better to have lower confidence than to misclassify

Return your response as JSON with this exact structure:
{
  "category": "category_name",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`;

  return prompt;
}

/**
 * Validate classification result
 */
function isValidClassification(result: any): result is ClassificationResult {
  return (
    result &&
    typeof result === 'object' &&
    typeof result.category === 'string' &&
    SUPPORTED_CATEGORIES.includes(result.category as any) &&
    typeof result.confidence === 'number' &&
    result.confidence >= 0 &&
    result.confidence <= 1 &&
    typeof result.reason === 'string'
  );
}

/**
 * Check if automatic routing is recommended based on classification
 */
export function shouldAutoRoute(classification: ClassificationResult | null): boolean {
  if (!classification) return false;
  return classification.confidence >= MIN_CONFIDENCE_THRESHOLD;
}

/**
 * Get manual routing requirement message
 */
export function getManualRoutingMessage(): string {
  return 'This report requires manual operator review for routing due to low AI confidence or unavailable classification.';
}
