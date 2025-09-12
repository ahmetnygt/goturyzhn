const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate sales & refund report as PDF.
 * @param {Array<Object>} rows - ticket rows to print
 * @param {string|stream.Writable} output - file path or writable stream
 * @returns {Promise<void>} resolves when writing finishes
 */
function generateSalesRefundReport(rows, output) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const stream = typeof output === 'string' ? fs.createWriteStream(output, { flags: 'w' }) : output;
  doc.pipe(stream);

  const regularFontPath = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
  const boldFontPath = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');
  try {
    doc.registerFont('Regular', regularFontPath);
    doc.registerFont('Bold', boldFontPath);
    doc.font('Regular');
  } catch (e) {
    console.warn('Font yüklenemedi, varsayılan font kullanılacak:', e.message);
  }

  doc.font('Bold').fontSize(14).text('Satışlar ve İadeler Raporu', { align: 'center' });
  doc.moveDown();

  const columns = [
    { key: 'user', header: 'Kullanıcı', w: 70 },
    { key: 'time', header: 'Zaman', w: 80 },
    { key: 'from', header: 'Nereden', w: 60 },
    { key: 'to', header: 'Nereye', w: 60 },
    { key: 'payment', header: 'Tahsilat', w: 50 },
    { key: 'action', header: 'İşlem', w: 45 },
    { key: 'seat', header: 'Koltuk', w: 40 },
    { key: 'gender', header: 'C', w: 20 },
    { key: 'pnr', header: 'PNR', w: 60 },
    { key: 'price', header: 'Ücret', w: 30, align: 'right' },
  ];

  let y = doc.y;
  const xStart = doc.page.margins.left;

  // table header
  doc.font('Bold').fontSize(9);
  let x = xStart;
  columns.forEach(col => {
    doc.text(col.header, x, y, { width: col.w, align: col.align || 'left' });
    x += col.w;
  });
  y += 16;
  doc.moveTo(xStart, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).stroke();

  // table rows
  doc.font('Regular').fontSize(8);
  rows.forEach(row => {
    const rowValues = {
      user: row.user || '',
      time: new Date(row.time).toLocaleString('tr-TR'),
      from: row.from || '',
      to: row.to || '',
      payment: row.payment || '',
      action: row.action || '',
      seat: row.seat != null ? String(row.seat) : '',
      gender: row.gender || '',
      pnr: row.pnr || '',
      price: (row.price != null ? Number(row.price).toFixed(2) : ''),
    };

    if (y + 14 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      x = xStart;
      doc.font('Bold');
      columns.forEach(col => {
        doc.text(col.header, x, y, { width: col.w, align: col.align || 'left' });
        x += col.w;
      });
      y += 16;
      doc.moveTo(xStart, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).stroke();
      doc.font('Regular');
    }

    x = xStart;
    columns.forEach(col => {
      doc.text(rowValues[col.key], x, y, { width: col.w, align: col.align || 'left' });
      x += col.w;
    });
    y += 14;
  });

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = generateSalesRefundReport;

if (require.main === module) {
  const sample = [
    { user: 'Ali', time: new Date(), from: 'ANK', to: 'IST', payment: 'cash', action: 'Satış', seat: 1, gender: 'E', pnr: 'ABC123', price: 100 },
    { user: 'Ayşe', time: new Date(), from: 'ANK', to: 'BUR', payment: 'card', action: 'İade', seat: 2, gender: 'K', pnr: 'XYZ789', price: 120 },
  ];
  generateSalesRefundReport(sample, 'sales_refunds.pdf').then(() => console.log('sales_refunds.pdf created'));
}
