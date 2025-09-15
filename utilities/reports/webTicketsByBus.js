const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate sales & refund report as PDF.
 * @param {Array<Object>} rows - ticket rows to print
 * @param {string|stream.Writable} output - file path or writable stream
 * @returns {Promise<void>} resolves when writing finishes
 */
function generateWebTicketsReport(rows, query, output) {
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

  const goturCut = 0.1;
  const firmCut = 0.05;
  const branchCut = 0.05;

  const xStart = doc.page.margins.left;
  const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font('Regular').fontSize(9);

  const drawSummaryRow = items => {
    const colWidth = fullWidth / items.length;
    const rowY = doc.y;

    items.forEach((it, idx) => {
      const x = xStart + idx * colWidth;

      doc.font('Bold').text(it.label, x, rowY, {
        width: colWidth,
        continued: true
      });

      doc.font('Regular').text(it.value, {
        width: colWidth
      });
    });

    doc.moveDown(0.8);
  };

  // place query information above the title and margins
  // doc.y = doc.page.margins.top - 25;
  // drawSummaryRow([
  //   { label: 'Tarih Aralığı: ', value: `${query.startDate} - ${query.endDate}` },
  // ]);
  // drawSummaryRow([
  //   { label: 'Tip: ', value: query.type == "detailed" ? "Detaylı" : "Özet" },
  //   { label: 'Şube: ', value: query.branch },
  //   { label: 'Kullanıcı: ', value: query.user },
  //   { label: 'Durak: ', value: `${query.from} - ${query.to}` },
  // ]);

  // reset position for title
  doc.y = doc.page.margins.top;
  doc.moveDown();
  const title = 'Otobüslere Göre Web Biletleri'.toLocaleUpperCase();
  doc.font('Bold').fontSize(14);

  const textWidth = doc.widthOfString(title);
  const centerX = (doc.page.width - textWidth) / 2; // sayfa ortası
  doc.text(title, centerX, doc.y);
  doc.moveDown();

  let salesCount = 0;
  let salesSummary = 0;
  let goturIncome = 0;
  let firmIncome = 0;
  let branchIncome = 0;
  let busIncome = 0;

  let buses = []

  rows.forEach(r => {
    const amount = Number(r.price) || 0;

    salesCount++;
    salesSummary += amount;
    goturIncome = amount * goturCut;
    firmIncome = amount * firmCut;
    branchIncome = amount * branchCut;
    busIncome = amount - goturIncome - firmIncome - branchIncome

    if (!buses.includes(r.busId))
      buses.push(r.busId)
  });

  console.log(rows)

  const fmt = n => Number(n || 0).toFixed(2);

  doc.font('Regular').fontSize(9);

  drawSummaryRow([
    { label: 'Toplam Bilet Adedi: ', value: salesCount },
    { label: 'Toplam Satış Tutar: ', value: salesSummary },
    { label: 'Toplam Götür Hakedişi: ', value: fmt(goturIncome) + "₺" },
  ]);
  drawSummaryRow([
    { label: 'Toplam Firma Hakedişi: ', value: fmt(firmIncome) + "₺" },
    { label: 'Toplam Şube Hakedişi: ', value: fmt(branchIncome) + "₺" },
    { label: 'Toplam Otobüs Hakedişi: ', value: fmt(busIncome) + "₺" },
  ]);

  doc.moveDown();

  const columns = [
    { key: 'license_plate', header: 'Plaka', w: 55 },
    { key: 'ticket_count', header: 'Bilet Adedi', w: 75 },
    { key: 'sales_summary', header: 'Satış Tutarı', w: 75 },
    { key: 'gotur_income', header: 'Götür Payı', w: 75 },
    { key: 'firm_income', header: 'Firma Payı', w: 75 },
    { key: 'branch_income', header: 'Şube Payı', w: 75 },
    { key: 'bus_income', header: 'Otobüs Payı', w: 75 },
  ];

  let y = doc.y;
  const headerHeight = 16;
  const rowHeight = 14;

  const drawHeader = () => {
    doc.font('Bold').fontSize(9);
    let x = xStart;
    columns.forEach(col => {
      doc.rect(x, y, col.w, headerHeight).stroke();
      doc.text(col.header, x, y + 4, {
        width: col.w,
        align: 'center'
      });
      x += col.w;
    });
    y += headerHeight;
    doc.font('Regular').fontSize(8);
  };

  drawHeader();

  // table rows
  rows.forEach(row => {
    const rowValues = {
      price: row.price,
      busId: row.busId,
      licensePlate: row.licensePlate
    };

    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }

    let x = xStart;
    columns.forEach(col => {
      doc.text(rowValues[col.key], x, y + 3, {
        width: col.w,
        align: 'center'
      });
      x += col.w;
    });
    y += rowHeight + 10;
  });

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = generateWebTicketsReport;

if (require.main === module) {
  const sample = [
    { user: 'Ali', time: new Date(), from: 'ANK', to: 'IST', payment: 'cash', status: 'completed', seat: 1, gender: 'E', pnr: 'ABC123', price: 100 },
    { user: 'Ayşe', time: new Date(), from: 'ANK', to: 'BUR', payment: 'card', status: 'refund', seat: 2, gender: 'K', pnr: 'XYZ789', price: 120 },
  ];
  generateWebTicketsReport(sample, {}, 'web_tickets.pdf').then(() => console.log('web_tickets.pdf created'));
}
