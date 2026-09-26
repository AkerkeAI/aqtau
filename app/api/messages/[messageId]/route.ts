/**
 * API Route for Message Operations
 * 
 * PATCH /api/messages/[messageId] - Update message
 * DELETE /api/messages/[messageId] - Delete message
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateMessageBody, deleteMessage, updateMessageStatus } from '@/lib/messaging/organization-messages';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const body = await request.json();
    const { messageId } = params;
    const { body: messageBody, status, providerMessageId } = body;

    if (status) {
      // Update status
      const success = await updateMessageStatus(messageId, status, providerMessageId);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to update message status' },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (messageBody) {
      // Update body
      const success = await updateMessageBody(messageId, messageBody);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to update message body' },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'No valid update fields provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in message update API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const { messageId } = params;
    const success = await deleteMessage(messageId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete message' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in message delete API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
