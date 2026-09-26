/**
 * API Route for Report Support Count
 * 
 * GET /api/reports/[id]/support-count - Get support count for a report
 * Uses SECURITY DEFINER RPC to avoid exposing supporter tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    console.log('[GET_SUPPORT_COUNT] reportId=', id);

    // Call the SECURITY DEFINER function to get support count
    const { data, error } = await supabase.rpc('get_report_support_count', {
      p_report_id: id,
    });

    if (error) {
      console.error('[GET_SUPPORT_COUNT_ERROR]', error);
      return NextResponse.json(
        { error: 'Failed to get support count', details: error.message },
        { status: 500 }
      );
    }

    console.log('[GET_SUPPORT_COUNT_RESULT] count=', data);

    return NextResponse.json({
      success: true,
      supportCount: data || 0,
    });
  } catch (error) {
    console.error('[GET_SUPPORT_COUNT_EXCEPTION]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
