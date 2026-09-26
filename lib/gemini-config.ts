/**
 * Centralized Gemini AI Configuration
 *
 * This file contains all Gemini-related configuration to make it easy to
 * change models, settings, and API behavior without hunting through the codebase.
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';

// Environment variable - never exposed to browser
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Model configuration - centralized for easy changes
export const GEMINI_CONFIG = {
  // Use a fast, cost-effective model that supports text and optional image input
  model: 'gemini-1.5-flash',

  // Configuration for generation
  generationConfig: {
    temperature: 0.7, // Balanced creativity and reliability
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 1024,
  },

  // Safety settings - adjust based on your requirements
  safetySettings: [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
],
};

// Supported report categories - must match application/database
export const SUPPORTED_CATEGORIES = [
  'roads',
  'lighting',
  'garbage',
  'water',
  'manholes',
  'sidewalks',
  'infrastructure',
  'other',
] as const;

// Category labels in Russian
export const CATEGORY_LABELS: Record<string, string> = {
  roads: 'Дороги',
  lighting: 'Освещение',
  garbage: 'Мусор',
  water: 'Вода',
  manholes: 'Люки',
  sidewalks: 'Тротуары',
  infrastructure: 'Инфраструктура',
  other: 'Другое',
};

/**
 * Get configured Gemini client
 * Returns null if API key is missing, allowing graceful degradation
 */
export function getGeminiClient(): GoogleGenerativeAI | null {
  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not configured - AI features will be disabled');
    return null;
  }

  try {
    return new GoogleGenerativeAI(GEMINI_API_KEY);
  } catch (error) {
    console.error('Failed to initialize Gemini client:', error);
    return null;
  }
}

/**
 * Check if Gemini is available
 */
export function isGeminiAvailable(): boolean {
  return getGeminiClient() !== null;
}

/**
 * Get Gemini model instance
 */
export function getGeminiModel() {
  const client = getGeminiClient();
  if (!client) return null;

  try {
    return client.getGenerativeModel({
      model: GEMINI_CONFIG.model,
      generationConfig: GEMINI_CONFIG.generationConfig,
      safetySettings: GEMINI_CONFIG.safetySettings,
    });
  } catch (error) {
    console.error('Failed to get Gemini model:', error);
    return null;
  }
}
