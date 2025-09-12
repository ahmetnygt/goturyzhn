const PDFDocument = require('pdfkit');
const fs = require('fs');
const Trip = require('../models/tripModel');
const Route = require('../models/routeModel');
const Ticket = require('../models/ticketModel');
const Bus = require('../models/busModel');
const Stop = require('../models/stopModel');
const RouteStop = require('../models/routeStopModel');

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

async function generateAccountReceiptFromDb(tripId, outputPath) {
  const trip = await Trip.findByPk(tripId);
  if (!trip) throw new Error('Trip not found');

  const route = await Route.findByPk(trip.routeId);
  const stopsNeeded = [route?.fromStopId, route?.toStopId].filter(Boolean);
  const [fromStop, toStop] = stopsNeeded.length
    ? await Stop.findAll({ where: { id: stopsNeeded } })
    : [];
  const bus = trip.busId ? await Bus.findByPk(trip.busId) : null;

  const tickets = await Ticket.findAll({ where: { tripId } });
  const routeStopIds = tickets.reduce((acc, t) => {
    if (t.fromRouteStopId) acc.add(t.fromRouteStopId);
    if (t.toRouteStopId) acc.add(t.toRouteStopId);
    return acc;
  }, new Set());

  const routeStops = await RouteStop.findAll({ where: { id: Array.from(routeStopIds) } });
  const stopIds = routeStops.map(rs => rs.stopId);
  const stops = stopIds.length ? await Stop.findAll({ where: { id: stopIds } }) : [];
  const stopMap = {};
  stops.forEach(s => {
    stopMap[s.id] = s.title;
  });
  const routeStopMap = {};
  routeStops.forEach(rs => {
    routeStopMap[rs.id] = rs.stopId;
  });

  const passengers = tickets.map((t, idx) => ({
    no: idx + 1,
    price: (t.price || 0).toFixed(2),
    from: stopMap[routeStopMap[t.fromRouteStopId]] || '',
    to: stopMap[routeStopMap[t.toRouteStopId]] || '',
    name: [t.name, t.surname].filter(Boolean).join(' '),
    gender: t.gender === 'f' ? 'K' : 'E'
  }));

  const total = tickets.reduce((sum, t) => sum + (t.price || 0), 0).toFixed(2);

  const data = {
    header: {
      stop: fromStop?.title || '',
      printedAt: new Date().toLocaleString('tr-TR'),
      route: route?.title || '',
      departure: `${trip.date} ${trip.time}`,
      arrival: toStop?.title || '',
      bus: bus?.licensePlate || ''
    },
    summary: {
      ticketCount: tickets.length,
      ticketTotal: total,
      commission: 0,
      cut: 0,
      ticketNumber: tickets.length,
      personCount: tickets.length,
      turnover: total,
      ticketSum: total,
      totalPassenger: tickets.length,
      sentTotal: 0,
      remainingTotal: total
    },
    passengers
  };

  generateAccountReceipt(data, outputPath);
}

module.exports = { generateAccountReceipt, generateAccountReceiptFromDb };

if (require.main === module) {
  const tripId = process.argv[2];
  if (!tripId) {
    console.error('Usage: node utilities/accountReceiptPdf.js <tripId>');
    process.exit(1);
  }

  generateAccountReceiptFromDb(tripId, 'account_receipt.pdf')
    .then(() => console.log('account_receipt.pdf created'))
    .catch(err => console.error('Error generating receipt:', err));
}
