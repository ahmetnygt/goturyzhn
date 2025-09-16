const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const SUMMARY_COLUMNS = 3;

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

  // const metaLines = [];
  // if (query.user) metaLines.push(`Kullanıcı: ${query.user}`);
  // if (query.branch) metaLines.push(`Şube: ${query.branch}`);
  // if (query.startDate || query.endDate) {
  //   metaLines.push(`Tarih Aralığı: ${(query.startDate || '-')}${query.endDate ? ` - ${query.endDate}` : ''}`);
  // }
  // if (query.generatedAt) metaLines.push(`Oluşturma: ${query.generatedAt}`);

  // if (metaLines.length) {
  //   doc.font('Regular').fontSize(9);
  //   metaLines.forEach((line) => {
  //     ensureVerticalSpace(12);
  //     doc.text(line, xStart, doc.y, { width: pageWidth });
  //   });
  //   doc.moveDown(0.5);
  // }

  const drawSummaryRow = (items) => {
    if (!items.length) return;

    const colWidth = pageWidth / items.length;
    const rowY = doc.y;

    items.forEach((item, index) => {
      const label = item.label?.endsWith(':') ? item.label : `${item.label}:`;
      const x = xStart + index * colWidth;

      doc.font('Bold').fontSize(9).text(label, x, rowY, {
        width: colWidth,
        continued: true,
      });

      doc.font('Regular').text(item.value ?? '', {
        width: colWidth,
      });
    });

    doc.moveDown(0.8);
  };

  const drawSummarySections = (items, columns = SUMMARY_COLUMNS) => {
    if (!items.length) return;

    const perRow = Math.max(1, Math.min(columns, items.length));
    chunk(items, perRow).forEach((row) => {
      ensureVerticalSpace(16);
      drawSummaryRow(row);
    });
    doc.moveDown(0.3);
  };

  drawSummarySections(summaryItems);

  if (netSummary.length) {
    drawSummarySections(netSummary, Math.min(3, netSummary.length));
  }

  doc.moveDown();

  const columns = [
    { key: 'date', header: 'Tarih', width: 85, align: 'center' },
    { key: 'type', header: 'Hareket Tipi', width: 95 },
    { key: 'description', header: 'Açıklama', width: 160 },
    { key: 'document', header: 'Belge No', width: 90 },
    { key: 'incomeOrExpense', header: 'Tür', width: 45, align: 'right' },
    { key: 'amount', header: 'Miktar', width: 45, align: 'right' },
  ];

  const totalWidth = columns.reduce((acc, c) => acc + c.width, 0);
  if (totalWidth > pageWidth) {
    const scale = pageWidth / totalWidth;
    columns.forEach((col) => {
      col.width = Math.floor(col.width * scale);
    });
  }

  const paddingX = 4;
  const paddingY = 4;
  const rowGap = 6;

  const tableWidth = columns.reduce((acc, c) => acc + c.width, 0);

  const drawTableHeader = () => {
    ensureVerticalSpace(18);
    const headerY = doc.y;
    let headerBottom = headerY;
    let x = xStart;

    doc.font('Bold').fontSize(9);
    columns.forEach((col) => {
      doc.text(col.header, x, headerY, {
        width: col.width,
        align: col.align || 'left',
      });
      headerBottom = Math.max(headerBottom, doc.y);
      doc.x = xStart;
      doc.y = headerY;
      x += col.width;
    });

    const underlineY = headerBottom + 2;
    doc.y = underlineY;
    doc.moveTo(xStart, underlineY).lineTo(xStart + tableWidth, underlineY).stroke();
    doc.y = underlineY + 4;
    doc.font('Regular').fontSize(8);
  };

  const calculateRowHeight = (row) => {
    let rowHeight = 0;
    columns.forEach((col) => {
      const text = row[col.key] || '';
      const textHeight = doc.heightOfString(String(text), {
        width: col.width - paddingX * 2,
      });
      rowHeight = Math.max(rowHeight, textHeight + paddingY * 2);
    });
    return rowHeight;
  };

  const drawRow = (row, rowHeight) => {
    const rowY = doc.y;
    let rowBottom = rowY;
    let x = xStart;
    columns.forEach((col) => {
      doc.text(row[col.key] || '', x + paddingX, rowY + paddingY, {
        width: col.width - paddingX * 2,
        align: col.align || 'left',
      });
      rowBottom = Math.max(rowBottom, doc.y);
      doc.x = xStart;
      doc.y = rowY;
      x += col.width;
    });
    doc.y = Math.max(rowBottom + rowGap, rowY + rowHeight + rowGap);
  };

  drawTableHeader();

  if (!rows.length) {
    ensureVerticalSpace(20);
    doc.font('Bold').fontSize(9).text('Kayıt bulunamadı.', xStart, doc.y + 8);
    doc.font('Regular').fontSize(8);
  } else {
    rows.forEach((row) => {
      const rowHeight = calculateRowHeight(row);
      if (doc.y + rowHeight + rowGap > pageBottom) {
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
