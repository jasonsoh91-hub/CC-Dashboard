const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function inspectPdfFields(pdfPath) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();

  console.log('=== PDF Form Fields ===');
  console.log(`PDF: ${pdfPath}`);
  console.log(`Total fields: ${form.getFields().length}\n`);

  const fields = form.getFields();
  fields.forEach((field, index) => {
    console.log(`${index + 1}. ${field.getName()} (${field.constructor.name})`);

    if (field.constructor.name === 'PDFTextField') {
      try {
        const text = field.getText();
        console.log(`   Default value: "${text}"`);
      } catch (e) {
        console.log(`   Default value: (empty)`);
      }
    } else if (field.constructor.name === 'PDFCheckBox') {
      try {
        const checked = field.check();
        console.log(`   Checked: ${checked ? 'Yes' : 'No'}`);
      } catch (e) {
        console.log(`   Checked: No`);
      }
    }
  });
}

// Inspect both PDFs
(async () => {
  const muamalatPath = '/Users/jason.soh/cc-agent-dashboard/public/templates/muamalat application form.pdf';
  const ocbcPath = '/Users/jason.soh/cc-agent-dashboard/public/templates/Ocbc application form.pdf';

  console.log('\n========================================\n');
  await inspectPdfFields(muamalatPath);

  console.log('\n========================================\n');
  await inspectPdfFields(ocbcPath);
})();
