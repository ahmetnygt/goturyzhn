const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const DEFAULT_COLUMNS = 3;
const BOX_GAP = 10;
const BOX_HEIGHT = 42;
const BOX_PADDING = 8;

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
};

const chunk = (arr, size) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
};

function generateDailyUserAccountReport(data, output) {
  const {
    rows = [],
    summaryItems = [],
    netSummary = [],
    query = {},
  } = data || {};

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const stream = typeof output === 'string'
    ? fs.createWriteStream(output, { flags: 'w' })
    : output;

  doc.pipe(stream);

  const regularFontPath = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
  const boldFontPath = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

  try {
    doc.registerFont('Regular', regularFontPath);
    doc.registerFont('Bold', boldFontPath);
    doc.font('Regular');
  } catch (err) {
    console.warn('Font yüklenemedi, varsayılan font kullanılacak:', err.message);
  }

  const xStart = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  const ensureVerticalSpace = (height) => {
    if (doc.y + height > pageBottom) {
      doc.addPage();
    }
  };

  // Title
  const title = 'Günlük Kullanıcı Hesabı Raporu'.toLocaleUpperCase('tr-TR');
  doc.font('Bold').fontSize(14).text(title, xStart, doc.y, { width: pageWidth, align: 'center' });
  doc.moveDown(0.5);

  const metaLines = [];
  if (query.user) metaLines.push(`Kullanıcı: ${query.user}`);
  if (query.branch) metaLines.push(`Şube: ${query.branch}`);
  if (query.startDate || query.endDate) {
    metaLines.push(`Tarih Aralığı: ${(query.startDate || '-')}${query.endDate ? ` - ${query.endDate}` : ''}`);
  }
  if (query.generatedAt) metaLines.push(`Oluşturma: ${query.generatedAt}`);

  if (metaLines.length) {
    doc.font('Regular').fontSize(9);
    metaLines.forEach((line) => {
      ensureVerticalSpace(12);
      doc.text(line, xStart, doc.y, { width: pageWidth });
    });
    doc.moveDown(0.5);
  }

  const drawSummaryBoxes = (items, columns = DEFAULT_COLUMNS) => {
    if (!items.length) return;

    const colCount = Math.max(1, columns);
    const boxWidth = (pageWidth - (colCount - 1) * BOX_GAP) / colCount;
    let y = doc.y;
    let x = xStart;

    chunk(items, colCount).forEach((rowItems) => {
      ensureVerticalSpace(BOX_HEIGHT + 4);
      y = doc.y;
      x = xStart;

      rowItems.forEach((item) => {
        doc.roundedRect(x, y, boxWidth, BOX_HEIGHT, 4).stroke();
        doc.font('Bold').fontSize(9).text(item.label, x + BOX_PADDING, y + BOX_PADDING, {
          width: boxWidth - BOX_PADDING * 2,
        });
        doc.font('Regular').fontSize(10).text(item.value, x + BOX_PADDING, y + BOX_PADDING + 16, {
          width: boxWidth - BOX_PADDING * 2,
        });

        x += boxWidth + BOX_GAP;
      });

      doc.y = y + BOX_HEIGHT + 8;
    });

    doc.moveDown(0.5);
  };

  drawSummaryBoxes(summaryItems);

  if (netSummary.length) {
    drawSummaryBoxes(netSummary, Math.min(netSummary.length, 3));
  }

  doc.moveDown();

  const columns = [
    { key: 'date', header: 'Tarih', width: 85, align: 'center' },
    { key: 'type', header: 'Hareket Tipi', width: 95 },
    { key: 'description', header: 'Açıklama', width: 160 },
    { key: 'document', header: 'Belge No', width: 90 },
    { key: 'income', header: 'Gelir', width: 45, align: 'right' },
    { key: 'expense', header: 'Gider', width: 45, align: 'right' },
  ];

  const totalWidth = columns.reduce((acc, c) => acc + c.width, 0);
  if (totalWidth > pageWidth) {
    const scale = pageWidth / totalWidth;
    columns.forEach((col) => {
      col.width = Math.floor(col.width * scale);
    });
  }

  const headerHeight = 20;
  const paddingX = 6;
  const paddingY = 6;

  const drawTableHeader = () => {
    ensureVerticalSpace(headerHeight + 4);
    let x = xStart;
    doc.font('Bold').fontSize(9);
    columns.forEach((col) => {
      doc.save();
      doc.rect(x, doc.y, col.width, headerHeight).fillAndStroke('#f2f2f2', '#000000');
      doc.restore();
      doc.fillColor('#000000').text(col.header, x + paddingX, doc.y + paddingY - 2, {
        width: col.width - paddingX * 2,
        align: col.align || 'left',
      });
      x += col.width;
    });
    doc.y += headerHeight;
    doc.font('Regular').fontSize(8);
  };

  const calculateRowHeight = (row) => {
    let rowHeight = 0;
    columns.forEach((col) => {
      const text = row[col.key] || '';
      const textHeight = doc.heightOfString(String(text), {
        width: col.width - paddingX * 2,
      });
      rowHeight = Math.max(rowHeight, textHeight + paddingY * 2 - 2);
    });
    if (rowHeight < headerHeight) rowHeight = headerHeight - 4;
    return rowHeight;
  };

  const drawRow = (row, rowHeight) => {
    let x = xStart;
    columns.forEach((col) => {
      doc.rect(x, doc.y, col.width, rowHeight).stroke();
      doc.text(row[col.key] || '', x + paddingX, doc.y + paddingY - 2, {
        width: col.width - paddingX * 2,
        align: col.align || 'left',
      });
      x += col.width;
    });
    doc.y += rowHeight;
  };

  drawTableHeader();

  if (!rows.length) {
    ensureVerticalSpace(20);
    doc.font('Bold').fontSize(9).text('Kayıt bulunamadı.', xStart, doc.y + 8);
    doc.font('Regular').fontSize(8);
  } else {
    rows.forEach((row) => {
      const rowHeight = calculateRowHeight(row);
      if (doc.y + rowHeight + 4 > pageBottom) {
        doc.addPage();
        drawTableHeader();
      }
      drawRow(row, rowHeight);
    });
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = {
  generateDailyUserAccountReport,
  formatCurrency,
};

if (require.main === module) {
  const sample = {
    query: {
      user: 'Test Kullanıcı',
      startDate: '2023-12-05 00:00',
      endDate: '2023-12-05 23:59',
    },
    summaryItems: [
      { label: 'Satılan Bilet Adedi', value: '11' },
      { label: 'İade Bilet Adedi', value: '0' },
      { label: 'Nakit Satış Tutarı', value: formatCurrency(8800) },
    ],
    netSummary: [
      { label: 'Nakit', value: formatCurrency(-2302) },
      { label: 'Kredi Kartı', value: formatCurrency(0) },
      { label: 'Toplam', value: formatCurrency(-2302) },
    ],
    rows: [
      {
        date: '05.12.2023 11:34:24',
        type: 'Nakit bilet satış',
        description: 'Örnek açıklama',
        document: 'PNR: ABC123',
        income: formatCurrency(900),
        expense: '',
      },
    ],
  };

  generateDailyUserAccountReport(sample, path.join(__dirname, 'daily_user_account_sample.pdf'))
    .then(() => console.log('daily_user_account_sample.pdf created'))
    .catch((err) => console.error('Sample PDF error:', err));
}
