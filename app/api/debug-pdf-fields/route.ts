import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const templatePath = path.join(process.cwd(), 'public/templates', 'muamalat application form.pdf');

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const pdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    const allFields = form.getFields();
    const fieldInfo = allFields.map(field => {
      const name = field.getName();
      let type = 'unknown';
      let value: any = undefined;

      try {
        if (field.constructor.name === 'PDFTextField') {
          type = 'text';
          value = (field as any).getText();
        } else if (field.constructor.name === 'PDFCheckBox') {
          type = 'checkbox';
          value = (field as any).isChecked();
        } else if (field.constructor.name === 'PDFButton') {
          type = 'button';
        }
      } catch (e) {
        // Ignore
      }

      return { name, type, value };
    });

    // Filter for gender and nationality related fields
    const genderFields = fieldInfo.filter(f =>
      f.name.toLowerCase().includes('gender') ||
      f.name.toLowerCase().includes('male') ||
      f.name.toLowerCase().includes('female')
    );

    const nationalityFields = fieldInfo.filter(f =>
      f.name.toLowerCase().includes('nationality') ||
      f.name.toLowerCase().includes('malaysia')
    );

    return NextResponse.json({
      totalFields: fieldInfo.length,
      genderFields,
      nationalityFields,
      allFields: fieldInfo.map(f => ({ name: f.name, type: f.type }))
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
