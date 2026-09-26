/**
 * API Route for Duplicate Report Detection
 * 
 * GET /api/reports/check-duplicate?lat=...&lng=...&category=...
 * 
 * Checks for nearby similar unresolved reports before creating a new report.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const category = searchParams.get('category');
    const radius = searchParams.get('radius') || '50';

    if (!lat || !lng || !category) {
      return NextResponse.json(
        { error: 'Missing required parameters: lat, lng, category' },
        { status: 400 }
      );
    }

    console.log('[DUPLICATE_CHECK] lat=', lat, 'lng=', lng, 'category=', category, 'radius=', radius);

    // Call the SECURITY DEFINER function to find nearby reports
    const { data: duplicates, error } = await supabase.rpc('find_nearby_reports', {
      p_latitude: parseFloat(lat),
      p_longitude: parseFloat(lng),
      p_category: category,
      p_radius_meters: parseFloat(radius),
    });

    if (error) {
      console.error('[DUPLICATE_CHECK_ERROR]', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { error: 'Failed to check for duplicates', details: error.message },
        { status: 500 }
      );
    }

    console.log('[DUPLICATE_CHECK_RESULT] found=', duplicates?.length || 0);

    return NextResponse.json({
      success: true,
      duplicates: (duplicates || []).slice(0, 3),
    });
  } catch (error) {
    console.error('[DUPLICATE_CHECK_EXCEPTION]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
