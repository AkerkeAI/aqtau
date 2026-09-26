/**
 * Report Routing Service
 *
 * Handles routing of reports to responsible organizations using:
 * 1. Deterministic routing for known categories
 * 2. AI-powered routing for "other" category
 */

import { supabase } from '@/lib/supabase-client';
import { classifyReport, shouldAutoRoute, getManualRoutingMessage } from '@/lib/ai/routing';

/**
 * Routing result
 */
export interface RoutingResult {
  success: boolean;
  organizationId?: string;
  organizationName?: string;
  aiCategory?: string;
  requiresManualRouting?: boolean;
  message?: string;
}

/**
 * Organization data
 */
export interface Organization {
  id: string;
  name: string;
  category: string;
  channel: string;
  destination: string;
  active: boolean;
}

/**
 * Route a report to the appropriate organization
 *
 * For known categories: uses deterministic routing
 * For "other" category: uses AI classification
 */
export async function routeReport(
  reportId: string,
  category: string,
  description: string,
  address?: string,
  photoUrl?: string,
  latitude?: number,
  longitude?: number
): Promise<RoutingResult> {
  console.log('[ROUTING_START] reportId=', reportId, 'category=', category);
  
  try {
    // For known categories, use deterministic routing
    if (category !== 'other') {
      return await routeKnownCategory(reportId, category);
    }

    // For "other" category: use AI classification
    return await routeWithAI(reportId, description, address, photoUrl, latitude, longitude);
  } catch (error) {
    console.error('[POST_SUBMIT_ERROR] stage=routing message=', error instanceof Error ? error.message : 'Unknown');
    return {
      success: false,
      message: 'Failed to route report',
    };
  }
}

/**
 * Route a known category report deterministically
 */
async function routeKnownCategory(
  reportId: string,
  category: string
): Promise<RoutingResult> {
  console.log('[ORGANIZATION_LOOKUP] category=', category);
  
  // Debug: show all available organizations
  const { data: allOrgs, error: allOrgsError } = await supabase
    .from('organizations')
    .select('id, name, category, active')
    .eq('active', true);
  
  if (allOrgsError) {
    console.error('[ALL_ORGS_ERROR]', allOrgsError);
  } else {
    console.log('[AVAILABLE_ORGANIZATIONS]', allOrgs?.map(o => ({ id: o.id, name: o.name, category: o.category, active: o.active })));
  }
  
  // Get responsible organization for this category
  const { data: organization, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('category', category)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('[POST_SUBMIT_ERROR] stage=organization_lookup message=', error.message, 'code=', error.code);
    return {
      success: false,
      message: 'Failed to fetch organization',
    };
  }

  if (!organization) {
    console.log('[ORGANIZATION_NOT_FOUND] category=', category);
    return {
      success: false,
      message: 'No organization found for this category',
    };
  }

  console.log('[ORGANIZATION_FOUND] organizationId=', organization.id, 'name=', organization.name);
  
  // Update report with organization
  console.log('[REPORT_ORGANIZATION_UPDATE] reportId=', reportId, 'organizationId=', organization.id);
  const { error: updateError } = await supabase
    .from('reports')
    .update({ organization_id: organization.id })
    .eq('id', reportId);

  if (updateError) {
    console.error('[POST_SUBMIT_ERROR] stage=organization_update message=', updateError.message, 'code=', updateError.code, 'details=', updateError.details);
    return {
      success: false,
      message: 'Failed to update report with organization',
    };
  }

  console.log('[ROUTING_COMPLETE] success=true');

  return {
    success: true,
    organizationId: organization.id,
    organizationName: organization.name,
    message: `Successfully routed to ${organization.name}`,
  };
}

/**
 * Route an "other" category report using AI classification
 */
async function routeWithAI(
  reportId: string,
  description: string,
  address?: string,
  photoUrl?: string,
  latitude?: number,
  longitude?: number
): Promise<RoutingResult> {
  console.log('[AI_CLASSIFICATION_START]');
  
  // Try AI classification
  const classification = await classifyReport({
    description,
    address,
    photoUrl,
    latitude,
    longitude,
  });

  if (!classification || !shouldAutoRoute(classification)) {
    // AI classification failed or confidence too low
    console.log('[AI_CLASSIFICATION_FAILED] or low confidence');
    return {
      success: false,
      requiresManualRouting: true,
      message: getManualRoutingMessage(),
    };
  }

  console.log('[AI_CLASSIFICATION_SUCCESS] category=', classification.category, 'confidence=', classification.confidence);
  
  // Update report with AI category
  const { error: updateError } = await supabase
    .from('reports')
    .update({ ai_category: classification.category })
    .eq('id', reportId);

  if (updateError) {
    console.error('[POST_SUBMIT_ERROR] stage=ai_category_update message=', updateError.message);
    return {
      success: false,
      message: 'Failed to update report with AI category',
    };
  }

  // Now route using the AI-classified category
  return await routeKnownCategory(reportId, classification.category);
}

/**
 * Get organization by category
 */
export async function getOrganizationByCategory(category: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('category', category)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('Error fetching organization:', error);
    return null;
  }

  return data as Organization | null;
}

/**
 * Get all active organizations
 */
export async function getActiveOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('active', true)
    .order('name');

  if (error) {
    console.error('Error fetching organizations:', error);
    return [];
  }

  return data as Organization[];
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(organizationId: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching organization:', error);
    return null;
  }

  return data as Organization | null;
}
