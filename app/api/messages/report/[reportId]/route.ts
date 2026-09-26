/**
 * API Route for Report Messages
 * 
 * GET /api/messages/report/[reportId] - Get messages for a report
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReportMessages, getLatestDraftMessage } from '@/lib/messaging/organization-messages';

export async function GET(
  request: NextRequest,
  { params }: { params: { reportId: string } }
) {
  try {
    const { reportId } = params;
    const { searchParams } = new URL(request.url);
    const latestOnly = searchParams.get('latest') === 'true';

    if (latestOnly) {
      const message = await getLatestDraftMessage(reportId);
      return NextResponse.json({ message });
    }

    const messages = await getReportMessages(reportId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error in report messages API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
