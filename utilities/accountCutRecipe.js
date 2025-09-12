const PDFDocument = require('pdfkit');
const fs = require('fs');
const Trip = require('../models/tripModel');
const Route = require('../models/routeModel');
const Ticket = require('../models/ticketModel');
const Bus = require('../models/busModel');
const Stop = require('../models/stopModel');
const RouteStop = require('../models/routeStopModel');
const path = require('path');
const { Op } = require('sequelize');
const BusAccountCut = require('../models/busAccountCutModel');
const Staff = require('../models/staffModel');

/**
 * Generate an account receipt PDF using supplied data.
 * @param {Object} data - Receipt information
 * @param {string} outputPath - Output file path
 */
function generateAccountReceipt(data, outputPath) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(fs.createWriteStream(outputPath, { flags: "w" }));

  const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // --- Türkçe destekli fontlar (yerel dosya) ---
  const regularFontPath = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
  const boldFontPath = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');
  try {
    doc.registerFont('Regular', regularFontPath);
    doc.registerFont('Bold', boldFontPath);
    doc.font('Regular'); // varsayılan font Türkçe uyumlu
  } catch (e) {
    console.warn('Font yüklenemedi, varsayılan font kullanılacak:', e.message);
  }

  const header = data.header || {};
  const summary = data.summary || {};
  const passengers = data.passengers || [];

  // === Header ===
  const pageWidth = doc.page.width;

  doc.font('Bold').fontSize(10);
  const dateText = `${header.departure || ''} `;
  const dateWidth = doc.widthOfString(dateText);
  doc.text(dateText, (pageWidth - dateWidth) / 2, 25);
  // Sefer - tam ortada büyük
  doc.font('Bold').fontSize(14);
  const seferText = `${header.route || ''}`;
  const seferWidth = doc.widthOfString(seferText);
  doc.text(seferText, (pageWidth - seferWidth) / 2, 40);
  // Plaka - altında biraz küçük
  doc.font('Bold').fontSize(12);
  const plakaText = `${header.bus || ''} `;
  const plakaWidth = doc.widthOfString(plakaText);
  doc.text(plakaText, (pageWidth - plakaWidth) / 2, 60);

  // Diğer bilgiler (başlık bold, değer normal)
  doc.fontSize(10);
  let y = 100;
  const leftX = 40;
  const rightX = 330;

  const drawLabelValue = (label, value, x, yy) => {
    doc.font('Bold').text(label, x, yy, { continued: true });
    doc.font('Regular').text(value);
  };

  drawLabelValue('Durak : ', header.stop || '', leftX, y);
  drawLabelValue('Şoför : ', header.driver || '', rightX, y);
  y += 15;
  y += 15;

  // === Summary block ===
  y = 140;

  const drawSummary = (label, value, x, yy) => {
    doc.font('Bold').text(label, x, yy, { continued: true });
    doc.font('Regular').text(String(value ?? ''));
  };

  drawSummary('Bilet Adedi : ', summary.ticketCount || 0, leftX, y);
  drawSummary('Kesintiler : ', summary.cut + "₺" || 0, rightX, y);
  y += 15;
  drawSummary('Toplam Kesilen : ', summary.ticketTotal + "₺" || 0, leftX, y);
  drawSummary('Çorba : ', summary.tip + "₺" || 0, rightX, y);
  y += 15;
  drawSummary('Komisyon : ', summary.commission + "₺" || 0, leftX, y);
  drawSummary('Ödenmesi Gereken : ', summary.needToPay + "₺" || 0, rightX, y);
  y += 15;
  drawSummary('Kalan Tutar : ', summary.afterComission + "₺" || 0, leftX, y);
  drawSummary('Ödenen : ', summary.payed + "₺" || 0, rightX, y);
  y += 15;
  drawSummary('Kalan : ', summary.remaining + "₺" || 0, rightX, y);
  // drawSummary(' : ', summary.totalPassenger || 0, leftX, y);
  // y += 15;
  // drawSummary('Kalan Tutar : ', summary.afterComission || 0, rightX, y);

  // === Passenger list (TABLE with borders) ===
  y += 40;
  const x0 = doc.page.margins.left;
  const W = availableWidth;
  const unit = W / 10;

  doc.fontSize(9);

  const cols = [
    { key: 'no', label: 'KN', x: x0 + unit * 0, w: unit * 1, align: 'left' },
    { key: 'name', label: 'Ad Soyad', x: x0 + unit * 1, w: unit * 3, align: 'left' },
    { key: 'gender', label: 'K/E', x: x0 + unit * 4, w: unit * 1, align: 'center' },
    { key: 'from', label: 'Nereden', x: x0 + unit * 5, w: unit * 2, align: 'left' },
    { key: 'to', label: 'Nereye', x: x0 + unit * 7, w: unit * 2, align: 'left' },
    { key: 'price', label: 'Ücret', x: x0 + unit * 9, w: unit * 1, align: 'right' },
  ];

  const pad = 4;
  const headerH = 18;
  const minRowH = 16;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  const useBold = () => { try { doc.font('Bold'); } catch { doc.font('Regular'); } };
  const useReg = () => { try { doc.font('Regular'); } catch { } };

  function drawHeader() {
    useBold();
    cols.forEach(col => {
      doc.rect(col.x, y, col.w, headerH).stroke();
      doc.text(col.label, col.x + pad, y + 4, { width: col.w - pad * 2, align: col.align });
    });
    y += headerH;
    useReg();
  }

  function newPageIfNeeded(nextRowH) {
    if (y + nextRowH > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
  }

  drawHeader();

  passengers.forEach(p => {
    const row = {
      no: String(p.no ?? ''),
      name: p.name ?? '',
      gender: p.gender ?? '',
      from: p.from ?? '',
      to: p.to ?? '',
      price: String(p.price + "₺" ?? ''),
    };

    const heights = cols.map(col =>
      doc.heightOfString(row[col.key], { width: col.w - pad * 2 })
    );
    const rowH = Math.max(minRowH, ...heights);

    newPageIfNeeded(rowH);

    cols.forEach(col => {
      doc.rect(col.x, y, col.w, rowH).stroke();
      doc.text(row[col.key], col.x + pad, y + 4, {
        width: col.w - pad * 2,
        align: col.align,
      });
    });

    y += rowH;
  });

  doc.end();
}

function addTime(baseTime, addTime) {
  // "12:30:00" ve "01:00:00" gibi stringleri alır
  const [h1, m1, s1] = baseTime.split(":").map(Number);
  const [h2, m2, s2] = addTime.split(":").map(Number);

  // toplam saniye
  let totalSeconds = (h1 * 3600 + m1 * 60 + s1) + (h2 * 3600 + m2 * 60 + s2);

  // 24 saati geçerse mod 24 yap
  totalSeconds = totalSeconds % (24 * 3600);

  // geri formatla
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor(totalSeconds % 3600 / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

async function generateAccountReceiptFromDb(tripId, stopId, outputPath) {
  const trip = await Trip.findOne({ where: { id: tripId } });
  if (!trip) throw new Error('Trip not found');

  const route = await Route.findOne({ where: { id: trip.routeId } });
  const routeStops = await RouteStop.findAll({ where: { routeId: route.id } });
  const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } });
  const bus = trip.busId ? await Bus.findOne({ where: { id: trip.busId } }) : null;
  const captain = await Staff.findOne({ where: { id: trip.captainId } })

  const routeStopOrder = routeStops.find(rs => rs.stopId == stopId).order

  if (routeStopOrder !== routeStops.length - 1) {
    for (let j = 0; j < routeStops.length; j++) {
      const rs = routeStops[j];

      trip.time = addTime(trip.time, rs.duration)

      if (rs.order == routeStopOrder)
        break
    }
  }

  const tickets = await Ticket.findAll({
    where: { tripId, fromRouteStopId: stopId, status: { [Op.notIn]: ["canceled", "refund"] } },
    order: [["seatNo", "ASC"]]
  });

  const passengers = tickets.map(t => ({
    no: t.seatNo,
    price: (t.price || 0).toFixed(2),
    from: stops.find(s => s.id == t.fromRouteStopId)?.title || '',
    to: stops.find(s => s.id == t.toRouteStopId)?.title || '',
    name: [t.name, t.surname].filter(Boolean).join(' '),
    gender: t.gender === 'f' ? 'K' : 'E'
  }));

  const total = tickets.reduce((sum, t) => sum + (t.price || 0), 0).toFixed(2);

  const accountCut = await BusAccountCut.findOne({ where: { tripId: trip.id, stopId: stopId } })

  const data = {
    header: {
      stop: stops.find(s => s.id == stopId)?.title || '',
      route: `${stops.find(s => s.id == stopId).title} - ${stops.find(s => s.id == route.toStopId).title}` || '',
      departure: `${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(new Date(trip.date))} ${trip.time.split(':').slice(0, 2).join(':')} `,
      arrival: stops.find(s => s.id == route.toStopId)?.title || '',
      bus: bus?.licensePlate || '',
      driver: captain?.name+" "+captain?.surname || ''
    },
    summary: {
      ticketCount: tickets.length,
      ticketTotal: Number(total),
      commission: accountCut.comissionAmount,
      cut: Number(accountCut.deduction1) + Number(accountCut.deduction2) + Number(accountCut.deduction3) + Number(accountCut.deduction4) + Number(accountCut.deduction5),
      tip: accountCut.tip,
      needToPay: accountCut.needToPayAmount,
      payed: accountCut.payedAmount,
      afterComission: Number(total) - Number(accountCut.comissionAmount),
      remaining: Number(accountCut.needToPayAmount) - Number(accountCut.payedAmount)
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
