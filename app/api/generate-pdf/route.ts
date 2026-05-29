import { NextRequest, NextResponse } from 'next/server';
import { fillPdfForm } from '@/lib/pdf';
import { ApplicationFormDataSchema } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[PDF API] Received body keys:', Object.keys(body));
    console.log('[PDF API] mykad_number:', body.mykad_number);
    console.log('[PDF API] employer_name:', body.employer_name);

    // Validate the incoming data
    const validatedData = ApplicationFormDataSchema.parse(body);

    // Generate the PDF
    const pdfBytes = await fillPdfForm(validatedData);

    // Return the PDF as a downloadable file
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cc-application-${validatedData.mykad_number || 'draft'}.pdf"`,
      },
    });
  } catch (error) {
    console.error('[PDF API] Error:', error);
    console.error('[PDF API] Error details:', error instanceof Error ? error.message : error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: 'Failed to generate PDF', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Use POST to generate PDF' });
}
