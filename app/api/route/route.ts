/**
 * API Route for Report Routing
 * 
 * POST /api/route - Route a report to an organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { routeReport } from '@/lib/routing/routing-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId, category, description, address, photoUrl, latitude, longitude } = body;

    if (!reportId || !category || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: reportId, category, description' },
        { status: 400 }
      );
    }

    const result = await routeReport(
      reportId,
      category,
      description,
      address,
      photoUrl,
      latitude,
      longitude
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in route API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
