import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const MARKER_SERVICE_URL = process.env.MARKER_SERVICE_URL || 'http://127.0.0.1:5003';

type MarkerResult = {
  success?: boolean;
  error?: string;
  format?: string;
  output?: unknown;
  metadata?: unknown;
};

/**
 * AI-powered PDF analysis using Marker.
 * Supports markdown, json, and html output formats.
 */
export async function POST(request: Request) {
  let tempFilePath = '';

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const outputFormat = (formData.get('format') as string) || 'markdown';
    const pageRange = formData.get('pageRange') as string || undefined;
    const forceOcr = formData.get('forceOcr') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate format
    const validFormats = ['markdown', 'json', 'html'];
    if (!validFormats.includes(outputFormat)) {
      return NextResponse.json(
        { error: `Invalid format. Must be one of: ${validFormats.join(', ')}` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();

    // Write file to temp path
    const tempDir = path.join(process.cwd(), 'scratch', 'uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    tempFilePath = path.join(tempDir, `${Date.now()}_analyze.pdf`);
    fs.writeFileSync(tempFilePath, Buffer.from(bytes));

    // Check marker service health
    const healthCheck = await fetch(`${MARKER_SERVICE_URL}/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      throw new Error(
        'Marker PDF service is not running. Please start it with: marker_service\\start.bat'
      );
    }

    // Send to marker service for analysis
    const response = await fetch(`${MARKER_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filepath: tempFilePath,
        output_format: outputFormat,
        page_range: pageRange || null,
        force_ocr: forceOcr,
      }),
    });

    const result = await response.json() as MarkerResult;

    // Clean up temp file
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'PDF analysis failed',
          details: result.error || 'Unknown error',
          format: outputFormat,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      format: result.format,
      output: result.output,
      metadata: result.metadata || {},
    });
  } catch (error: unknown) {
    console.error('PDF analysis error:', error);

    // Ensure cleanup on error
    try {
      if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (e) {
      console.warn('Error-path cleanup warning:', e);
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to analyze PDF',
        details: String(error),
      },
      { status: 500 }
    );
  }
}
