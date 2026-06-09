import { NextRequest, NextResponse } from 'next/server';
import { fillPdfForm } from '@/lib/pdf';
import { ApplicationFormDataSchema } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[PDF API] Received body keys:', Object.keys(body));
    console.log('[PDF API] mykad_number:', body.mykad_number);
    console.log('[PDF API] employer_name:', body.employer_name);
    console.log('[PDF API] bank_id:', body.bank_id);
    console.log('[PDF API] agree_tawarruq:', body.agree_tawarruq);

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
    console.error('[PDF API] Error occurred');
    console.error('[PDF API] Error type:', error?.constructor?.name);
    console.error('[PDF API] Error message:', error instanceof Error ? error.message : 'No message');
    console.error('[PDF API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('[PDF API] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    const errorResponse: any = { error: 'Failed to generate PDF' };

    if (error instanceof Error) {
      errorResponse.details = error.message;
      errorResponse.name = error.name;
    } else {
      errorResponse.details = String(error);
    }

    console.log('[PDF API] Sending error response:', JSON.stringify(errorResponse));

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Use POST to generate PDF' });
}
