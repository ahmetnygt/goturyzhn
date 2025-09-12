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
  
  const xStart = doc.page.margins.left;
  const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // summary calculations
  const paymentTypes = ['cash', 'card', 'spcs', 'nws', 'point'];
  const totals = {};
  paymentTypes.forEach(p => totals[p] = { sale: 0, refund: 0 });

  let salesCount = 0;
  let refundCount = 0;
  let gidisKomisyon = 0;
  let donusKomisyon = 0;

  rows.forEach(r => {
    const pay = r.payment || 'other';
    const amount = Number(r.price) || 0;
    const isRefund = (r.action || '').toLowerCase().startsWith('iade');
    if (!totals[pay]) totals[pay] = { sale: 0, refund: 0 };
    if (isRefund) {
      totals[pay].refund += amount;
      refundCount++;
    } else {
      totals[pay].sale += amount;
      salesCount++;
    }
    gidisKomisyon += Number(r.goCommission || r.gidisKomisyon || 0);
    donusKomisyon += Number(r.returnCommission || r.donusKomisyon || 0);
  });

  const passengerCount = salesCount - refundCount;
  const netTotal = Object.values(totals).reduce((sum, t) => sum + t.sale - t.refund, 0);

  const fmt = n => Number(n || 0).toFixed(2);

  doc.font('Regular').fontSize(9);

  const drawSummaryRow = items => {
    const colWidth = fullWidth / items.length;
    items.forEach((it, idx) => {
      doc.text(`${it.label} ${it.value}`, xStart + idx * colWidth, doc.y, { width: colWidth });
    });
    doc.moveDown(0.5);
  };

  drawSummaryRow([
    { label: 'Toplam Nakit Satış:', value: fmt(totals.cash.sale) },
    { label: 'Toplam Nakit İade:', value: fmt(totals.cash.refund) },
    { label: 'Toplam Net Nakit:', value: fmt(totals.cash.sale - totals.cash.refund) },
  ]);
  drawSummaryRow([
    { label: 'Toplam KK Satış:', value: fmt(totals.card.sale) },
    { label: 'Toplam KK İade:', value: fmt(totals.card.refund) },
    { label: 'Toplam Net KK:', value: fmt(totals.card.sale - totals.card.refund) },
  ]);
  drawSummaryRow([
    { label: 'Toplam SPCS Satış:', value: fmt(totals.spcs.sale) },
    { label: 'Toplam SPCS İade:', value: fmt(totals.spcs.refund) },
    { label: 'Toplam Net SPCS:', value: fmt(totals.spcs.sale - totals.spcs.refund) },
  ]);
  drawSummaryRow([
    { label: 'Toplam NWS Satış:', value: fmt(totals.nws.sale) },
    { label: 'Toplam NWS İade:', value: fmt(totals.nws.refund) },
    { label: 'Toplam Net NWS:', value: fmt(totals.nws.sale - totals.nws.refund) },
  ]);
  drawSummaryRow([
    { label: 'Toplam Puanlı Satış:', value: fmt(totals.point.sale) },
    { label: 'Toplam Puanlı İade:', value: fmt(totals.point.refund) },
    { label: 'Toplam Net Puanlı:', value: fmt(totals.point.sale - totals.point.refund) },
  ]);
  drawSummaryRow([
    { label: 'Gidiş Biletler Komisyon:', value: fmt(gidisKomisyon) },
    { label: 'Dönüş Biletler Komisyon:', value: fmt(donusKomisyon) },
  ]);
  drawSummaryRow([
    { label: 'Toplam Satış Adedi:', value: salesCount },
    { label: 'Toplam İade Adedi:', value: refundCount },
    { label: 'Toplam Net Tutar:', value: fmt(netTotal) },
  ]);
  drawSummaryRow([
    { label: 'Toplam Yolcu Adedi:', value: passengerCount },
  ]);

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
  const headerHeight = 16;
  const rowHeight = 14;

  const drawHeader = () => {
    doc.font('Bold').fontSize(9);
    let x = xStart;
    columns.forEach(col => {
      doc.rect(x, y, col.w, headerHeight).stroke();
      doc.text(col.header, x + 2, y + 4, { width: col.w - 4, align: col.align || 'left' });
      x += col.w;
    });
    y += headerHeight;
    doc.font('Regular').fontSize(8);
  };

  drawHeader();

  // table rows
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
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }

    let x = xStart;
    columns.forEach(col => {
      doc.rect(x, y, col.w, rowHeight).stroke();
      doc.text(rowValues[col.key], x + 2, y + 3, { width: col.w - 4, align: col.align || 'left' });
      x += col.w;
    });
    y += rowHeight;
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
