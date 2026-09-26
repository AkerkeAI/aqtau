/**
 * API Route for Organizations
 * 
 * GET /api/organizations - Get all active organizations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveOrganizations, getOrganizationById } from '@/lib/routing/routing-service';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('id');

    if (organizationId) {
      const organization = await getOrganizationById(organizationId);
      if (!organization) {
        return NextResponse.json(
          { error: 'Organization not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ organization });
    }

    const organizations = await getActiveOrganizations();
    return NextResponse.json({ organizations });
  } catch (error) {
    console.error('Error in organizations API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
