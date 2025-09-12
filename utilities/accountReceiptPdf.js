const PDFDocument = require('pdfkit');
const fs = require('fs');

/**
 * Generate an account receipt PDF using supplied data.
 * @param {Object} data - Receipt information
 * @param {string} outputPath - Output file path
 */
function generateAccountReceipt(data, outputPath) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(fs.createWriteStream(outputPath));

  const header = data.header || {};
  const summary = data.summary || {};
  const passengers = data.passengers || [];

  doc.fontSize(10);

  // Header information
  doc.text(`Durak : ${header.stop || ''}`, 40, 40);
  doc.text(`Basım : ${header.printedAt || ''}`, 330, 40);
  doc.text(`Sefer : ${header.route || ''}`, 40, 55);
  doc.text(`Başlangıç : ${header.start || ''}`, 330, 55);
  doc.text(`Kalkış : ${header.departure || ''}`, 40, 70);
  doc.text(`Varış : ${header.arrival || ''}`, 330, 70);
  doc.text(`Plaka : ${header.bus || ''}`, 40, 85);
  doc.text(`Şoför : ${header.driver || ''}`, 330, 85);

  // Summary block
  let y = 120;
  const leftX = 40;
  const rightX = 330;
  doc.text(`Bilet Adedi : ${summary.ticketCount || 0}`, leftX, y);
  doc.text(`Komisyon : ${summary.commission || 0}`, rightX, y);
  y += 15;
  doc.text(`Bilet Tutarı : ${summary.ticketTotal || 0}`, leftX, y);
  doc.text(`Kesilen : ${summary.cut || 0}`, rightX, y);
  y += 15;
  doc.text(`Bilet Sayısı : ${summary.ticketNumber || 0}`, leftX, y);
  doc.text(`Kişi Sayısı : ${summary.personCount || 0}`, rightX, y);
  y += 15;
  doc.text(`Ciro Toplamı : ${summary.turnover || 0}`, leftX, y);
  doc.text(`Bilet Toplamı : ${summary.ticketSum || 0}`, rightX, y);
  y += 15;
  doc.text(`Toplam Yolcu : ${summary.totalPassenger || 0}`, leftX, y);
  doc.text(`Gönderilen Tutar : ${summary.sentTotal || 0}`, rightX, y);
  y += 15;
  doc.text(`Kalan Tutar : ${summary.remainingTotal || 0}`, rightX, y);

  // Passenger list
  y += 40;
  doc.fontSize(9);
  doc.text('No', 40, y);
  doc.text('Ücret', 70, y);
  doc.text('Nereden', 120, y);
  doc.text('Nereye', 200, y);
  doc.text('Ad Soyad', 280, y);
  doc.text('K/V', 420, y);
  y += 15;

  passengers.forEach(p => {
    doc.text(p.no, 40, y);
    doc.text(p.price, 70, y);
    doc.text(p.from, 120, y);
    doc.text(p.to, 200, y);
    doc.text(p.name, 280, y);
    doc.text(p.gender || '', 420, y);
    y += 15;
  });

  doc.end();
}

module.exports = generateAccountReceipt;

if (require.main === module) {
  const sampleData = {
    header: {
      stop: 'ÇANAKKALE',
      printedAt: '12.09.2050 06:12:31',
      route: '1202S ÇANAKKALE - BURSA 05:01',
      departure: '12.09.2050 05:00',
      arrival: 'BURSA',
      bus: '18 BCH 859',
      driver: 'Mehmet'
    },
    summary: {
      ticketCount: 4,
      ticketTotal: '2399',
      commission: '59.75',
      cut: '0',
      ticketNumber: 4,
      personCount: 4,
      turnover: '2399',
      ticketSum: '2399',
      totalPassenger: 4,
      sentTotal: '1799.25',
      remainingTotal: '599.75'
    },
    passengers: [
      { no: 1, price: '599.75', from: 'ÇANAKKALE', to: 'BURSA', name: 'Sefaya Canger', gender: 'K' },
      { no: 2, price: '599.75', from: 'ÇANAKKALE', to: 'BURSA', name: 'Ali Nurdahan Canger', gender: 'E' },
      { no: 3, price: '599.75', from: 'ÇANAKKALE', to: 'BURSA', name: 'Cem Canger', gender: 'E' },
      { no: 4, price: '599.75', from: 'ÇANAKKALE', to: 'BURSA', name: 'Eren Canger', gender: 'E' }
    ]
  };

  generateAccountReceipt(sampleData, 'account_receipt.pdf');
  console.log('account_receipt.pdf created');
}
