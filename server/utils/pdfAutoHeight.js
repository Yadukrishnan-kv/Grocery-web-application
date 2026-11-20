// Shared helper for 80mm thermal-paper PDF receipts.
//
// PDFKit requires the page size to be known at construction time, so a
// fixed-height page (e.g. 800pt, roughly A4's height) was previously used
// for every receipt regardless of how little content it actually had. On a
// real thermal roll printer this feeds out a trailing blank gap after the
// content; on screen it renders like a mostly-empty A4 page.
//
// To get a page whose height matches its content ("auto height"), the draw
// callback runs once against a throwaway tall page purely to measure how
// far `y` advances, then runs again for real against a page sized to that
// measured height.
const PDFDocument = require("pdfkit");
const { Writable } = require("stream");

const discardStream = () => new Writable({ write(_chunk, _enc, cb) { cb(); } });

// draw(doc) performs the full layout; its own hand-tracked return value is
// measured from the START of the last line it drew, not its bottom edge, so
// it understates the true content height by one line. PDFKit's own cursor
// (doc.y) is updated by every text() call — even ones given explicit x/y —
// to the bottom of what was just rendered, so that's what we trust instead.
function measureThermalHeight({ pageWidth, margin, draw }) {
  const measureDoc = new PDFDocument({ size: [pageWidth, 5000], margin, bufferPages: true });
  measureDoc.pipe(discardStream());
  const returnedY = draw(measureDoc);
  const finalY = Math.max(returnedY || 0, measureDoc.y);
  measureDoc.end();
  return finalY;
}

function renderThermalPDF({
  res,
  filename,
  disposition = "attachment",
  pageWidth = 226,
  margin = 10,
  bottomPadding = 14,
  draw,
}) {
  const finalY = measureThermalHeight({ pageWidth, margin, draw });
  const pageHeight = Math.ceil(finalY + bottomPadding);

  const doc = new PDFDocument({ size: [pageWidth, pageHeight], margin, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
  doc.on("error", (err) => {
    console.error("PDF generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error generating PDF" });
    }
  });
  doc.pipe(res);
  draw(doc);
  doc.end();
}

module.exports = { renderThermalPDF, measureThermalHeight };
