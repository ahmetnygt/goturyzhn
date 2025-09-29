const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const formatCurrency = (value) => {
  const amount = safeNumber(value);
  return `${amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
};

const formatCount = (value) => {
  const num = safeNumber(value);
  return num.toLocaleString('tr-TR');
};

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formatDateTime = (value) => {
  const date = normalizeDate(value);
  return date ? dateTimeFormatter.format(date) : '';
};

function generateBusTransactionsReport(data, output) {
  const {
    generatedAt,
    query = {},
    totals = {},
    groups = [],
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
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  const ensureSpace = (height) => {
    if (doc.y + height > pageBottom) {
      doc.addPage();
      doc.font('Regular').fontSize(9);
    }
  };

  const drawKeyValueRow = (items) => {
    if (!items || !items.length) return;

    ensureSpace(16);
    const colWidth = usableWidth / items.length;
    const rowY = doc.y;

    items.forEach((item, index) => {
      const x = xStart + index * colWidth;
      const label = item.label ? `${item.label}: ` : '';

      doc.font('Bold').text(label, x, rowY, {
        width: colWidth,
        continued: true,
      });

      doc.font('Regular').text(item.value ?? '', {
        width: colWidth,
      });
    });

    doc.moveDown(0.8);
  };

  const drawGroupTotals = (groupTotals, busTitle) => {
    const items = [
      { label: 'Plaka', value: busTitle },
      { label: 'Gelir', value: formatCurrency(groupTotals.income) },
      { label: 'Gider', value: formatCurrency(groupTotals.expense) },
      { label: 'Net', value: formatCurrency(groupTotals.net) },
    ];
    drawKeyValueRow(items);
  };

  const columns = [
    { key: 'date', label: 'Tarih', width: 120, align: 'center' },
    { key: 'description', label: 'Açıklama', width: usableWidth - 280, align: 'left' },
    { key: 'type', label: 'Tür', width: 80, align: 'center' },
    { key: 'amount', label: 'Tutar', width: 80, align: 'right' },
  ];

  const formatColumnValue = (row, key) => {
    switch (key) {
      case 'date':
        return formatDateTime(row.date);
      case 'description':
        return row.description || '';
      case 'type':
        return row.type === 'income' ? 'Gelir' : 'Gider';
      case 'amount':
        return formatCurrency(row.amount);
      default:
        return row[key] ?? '';
    }
  };

  const calculateRowHeight = (row) => {
    let height = 0;
    columns.forEach((col) => {
      const text = String(formatColumnValue(row, col.key) ?? '');
      const textHeight = doc.heightOfString(text, {
        width: col.width,
      });
      height = Math.max(height, textHeight + 4);
    });
    return height;
  };

  const drawTableHeader = () => {
    ensureSpace(20);
    const headerY = doc.y;
    let x = xStart;

    doc.font('Bold');
    columns.forEach((col) => {
      doc.text(col.label, x, headerY, {
        width: col.width,
        align: 'center',
      });
      x += col.width;
    });
    doc.font('Regular');
    doc.moveDown(0.6);
  };

  const drawTableRow = (row) => {
    const rowHeight = calculateRowHeight(row);
    ensureSpace(rowHeight + 6);

    const rowTop = doc.y;
    let x = xStart;

    columns.forEach((col) => {
      const text = String(formatColumnValue(row, col.key) ?? '');
      doc.text(text, x, rowTop, {
        width: col.width,
        align: col.align,
      });
      x += col.width;
    });

    doc.y = rowTop + rowHeight;
    doc.moveDown(0.1);
  };

  const title = 'Otobüs Gelir Gider Raporu'.toLocaleUpperCase('tr-TR');
  doc.font('Bold').fontSize(14).text(title, xStart, doc.y, { width: usableWidth, align: 'center' });
  doc.moveDown(0.8);
  doc.font('Regular').fontSize(9);

  drawKeyValueRow([
    { label: 'Rapor Tarihi', value: formatDateTime(generatedAt || new Date()) },
    { label: 'Başlangıç', value: formatDateTime(query.startDate) },
    { label: 'Bitiş', value: formatDateTime(query.endDate) },
    { label: 'Plaka', value: query.bus || 'Tümü' },
  ]);

  drawKeyValueRow([
    { label: 'Toplam Gelir', value: formatCurrency(totals.income) },
    { label: 'Toplam Gider', value: formatCurrency(totals.expense) },
    { label: 'Net Tutar', value: formatCurrency(totals.net) },
    { label: 'Toplam Kayıt', value: formatCount(totals.count) },
  ]);

  if (!groups.length) {
    ensureSpace(40);
    doc.text('Belirtilen kriterlere uygun kayıt bulunamadı.', xStart, doc.y, {
      width: usableWidth,
      align: 'center',
    });
    doc.end();
    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  groups.forEach((group, index) => {
    const busTitle = group.busTitle || 'Otobüs';
    ensureSpace(24);
    doc.font('Bold').fontSize(11).text(busTitle, xStart, doc.y, { width: usableWidth });
    doc.moveDown(0.3);
    doc.font('Regular').fontSize(9);

    drawTableHeader();

    if (!group.rows || !group.rows.length) {
      ensureSpace(20);
      doc.text('Bu otobüs için kayıt bulunamadı.', xStart, doc.y, {
        width: usableWidth,
        align: 'center',
      });
      doc.moveDown(0.6);
    } else {
      group.rows.forEach((row) => {
        drawTableRow(row);
      });
    }

    doc.moveDown(0.4);
    doc.font('Bold');
    drawGroupTotals(group.totals || {}, busTitle);
    doc.font('Regular');

    if (index < groups.length - 1) {
      doc.moveDown(0.6);
      const separatorY = doc.y;
      ensureSpace(10);
      doc.moveTo(xStart, separatorY).lineTo(xStart + usableWidth, separatorY).stroke();
      doc.moveDown(0.6);
    }
  });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = generateBusTransactionsReport;

