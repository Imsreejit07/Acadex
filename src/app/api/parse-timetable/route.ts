import { NextResponse } from 'next/server';
import { parseTimetableFromBuffer, testLlmConnection } from '@/lib/timetable-parser';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';

  // Handle connection test
  if (contentType.includes('application/json')) {
    try {
      const body = await request.json() as { action?: string };
      if (body.action === 'test') {
        const testRes = await testLlmConnection();
        return NextResponse.json(testRes);
      }
    } catch (e: unknown) {
      return NextResponse.json(
        { success: false, error: 'Malformed JSON', details: String(e) },
        { status: 400 }
      );
    }
  }

  // Handle PDF upload
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const result = await parseTimetableFromBuffer(bytes, file.name);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error parsing timetable:', error);

    return NextResponse.json(
      {
        error: 'Failed to parse timetable.',
        details: errMsg,
      },
      { status: 500 }
    );
  }
}
