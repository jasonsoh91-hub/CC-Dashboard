// This script helps identify field positions on the OCBC PDF
// We'll use visual inspection and trial to find coordinates

const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');

async function measurePdf(pdfPath) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);

  const { width, height } = page.getSize();
  console.log('=== PDF Page Dimensions ===');
  console.log(`Width: ${width} points (${(width / 72).toFixed(2)} inches)`);
  console.log(`Height: ${height} points (${(height / 72).toFixed(2)} inches)`);
  console.log(`Origin: Top-left (0, ${height})`);

  // Create a test PDF with grid lines to help identify positions
  const testPdf = await PDFDocument.create();
  const testPage = testPdf.addPage([width, height]);

  // Draw grid every 50 points
  for (let x = 0; x < width; x += 50) {
    await testPage.drawLine({
      start: { x, y: 0 },
      end: { x, y: height },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });
    // Label every 100 points
    if (x % 100 === 0) {
      testPage.drawText(x.toString(), {
        x: x + 2,
        y: height - 15,
        size: 8,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  for (let y = 0; y < height; y += 50) {
    await testPage.drawLine({
      start: { x: 0, y },
      end: { x: width, y },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });
    if (y % 100 === 0 && y !== 0) {
      testPage.drawText(y.toString(), {
        x: 5,
        y: y - 2,
        size: 8,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  const testPdfBytes = await testPdf.save();
  fs.writeFileSync('/Users/jason.soh/cc-agent-dashboard/public/templates/ocbc-grid-guide.pdf', testPdfBytes);
  console.log('\nGrid guide saved to: ocbc-grid-guide.pdf');
  console.log('Use this to identify field coordinates (x, y from top-left)');
}

measurePdf('/Users/jason.soh/cc-agent-dashboard/public/templates/Ocbc application form.pdf');
