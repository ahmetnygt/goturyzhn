const Ticket = require('../models/ticketModel');
const SystemLog = require('../models/systemLogModel');
const { Op } = require('sequelize');

// Try to use node-cron; fall back to setInterval if unavailable
let cron;
try {
  cron = require('node-cron');
} catch (err) {
  console.warn('node-cron not installed, using setInterval fallback');
}

// Task that cancels expired reservations and deletes expired pendings
async function cancelExpiredReservations() {
  const now = new Date();
  const sequelize = Ticket.sequelize; // transaction için

  try {
    // Tek sorgu ile al, sonra ayır
    const expiredTickets = await Ticket.findAll({
      where: {
        status: { [Op.in]: ['reservation', 'pending'] },
        optionTime: { [Op.lt]: now }
      },
      attributes: ['id', 'status'] // performans
    });

    if (expiredTickets.length === 0) return;

    const reservationIds = [];
    const pendingIds = [];
    for (const t of expiredTickets) {
      if (t.status === 'reservation') reservationIds.push(t.id);
      else if (t.status === 'pending') pendingIds.push(t.id);
    }

    // İşlemleri atomik yapmak için transaction
    await sequelize.transaction(async (tx) => {
      // 1) reservation → cancelled
      if (reservationIds.length) {
        await Ticket.update(
          { status: 'cancelled' },      // NOT: Modeliniz "canceled" kullanıyorsa burayı ona göre değiştirin.
          { where: { id: { [Op.in]: reservationIds } }, transaction: tx }
        );

        await SystemLog.bulkCreate(
          reservationIds.map(id => ({
            userId: null,
            branchId: null,
            module: 'ticket',
            action: 'auto_cancel',
            referenceId: id,
            newData: { status: 'cancelled' },
            description: 'Reservation automatically cancelled by scheduler'
          })),
          { transaction: tx }
        );
      }

      // 2) pending → destroy
      if (pendingIds.length) {
        await Ticket.destroy({
          where: { id: { [Op.in]: pendingIds } },
          transaction: tx
        });

        await SystemLog.bulkCreate(
          pendingIds.map(id => ({
            userId: null,
            branchId: null,
            module: 'ticket',
            action: 'auto_delete',
            referenceId: id,
            newData: { deleted: true },
            description: 'Pending ticket automatically deleted by scheduler'
          })),
          { transaction: tx }
        );
      }
    });

    if (reservationIds.length) {
      console.log(`[Scheduler] Reservations cancelled: ${reservationIds.join(', ')}`);
    }
    if (pendingIds.length) {
      console.log(`[Scheduler] Pending tickets deleted: ${pendingIds.join(', ')}`);
    }
  } catch (err) {
    console.error('Error canceling/deleting expired tickets:', err);
  }
}

let jobInstance;
function start() {
  if (cron) {
    // Her dakika çalışır
    jobInstance = cron.schedule('* * * * *', cancelExpiredReservations);
  } else {
    jobInstance = setInterval(cancelExpiredReservations, 60 * 1000);
  }
}

function stop() {
  if (cron && jobInstance) {
    jobInstance.stop();
  } else if (jobInstance) {
    clearInterval(jobInstance);
  }
}

module.exports = { start, stop };