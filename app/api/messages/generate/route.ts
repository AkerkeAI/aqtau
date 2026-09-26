/**
 * API Route for Message Generation
 * 
 * POST /api/messages/generate - Generate an organization message
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAndStoreMessage } from '@/lib/messaging/organization-messages';
import { fetchReportById } from '@/lib/reports';
import { getOrganizationById } from '@/lib/routing/routing-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId, organizationId } = body;

    if (!reportId || !organizationId) {
      return NextResponse.json(
        { error: 'Missing required fields: reportId, organizationId' },
        { status: 400 }
      );
    }

    // Fetch report data
    const report = await fetchReportById(reportId);
    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // Fetch organization data
    const organization = await getOrganizationById(organizationId);
    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Generate and store message
    const message = await generateAndStoreMessage(
      reportId,
      organizationId,
      report,
      organization
    );

    if (!message) {
      return NextResponse.json(
        { error: 'Failed to generate message' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Error in message generation API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
