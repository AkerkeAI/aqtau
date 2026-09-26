/**
 * API Route for Report Routing
 * 
 * POST /api/reports/[id] - Route a report to an organization
 * 
 * This server-side route uses a SECURITY DEFINER function to safely assign
 * organizations to reports without giving anon users general UPDATE permissions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    console.log('[SERVER_ROUTE_START] reportId=', id);
    
    // Fetch the report to get its category
    const { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('id, category')
      .eq('id', id)
      .maybeSingle();
    
    if (fetchError) {
      console.error('[SERVER_ROUTE_ERROR] stage=fetch_report', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch report', details: fetchError.message },
        { status: 500 }
      );
    }
    
    if (!report) {
      console.log('[SERVER_ROUTE_ERROR] report_not_found');
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }
    
    console.log('[SERVER_ROUTE_REPORT_FOUND] category=', report.category);
    
    // Call the SECURITY DEFINER function to assign organization
    // Note: function reads category from report internally, only needs report_id
    const { data: result, error: rpcError } = await supabase.rpc('assign_report_organization', {
      p_report_id: id,
    });
    
    if (rpcError) {
      console.error('[SERVER_ROUTE_ERROR] stage=rpc_assign', rpcError);
      return NextResponse.json(
        { error: 'Failed to assign organization', details: rpcError.message },
        { status: 500 }
      );
    }
    
    console.log('[SERVER_ROUTE_SUCCESS] organizationId=', result);
    
    return NextResponse.json({
      success: true,
      reportId: id,
      organizationId: result,
    });
  } catch (error) {
    console.error('[SERVER_ROUTE_EXCEPTION]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
