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

// Task that cancels expired reservations
async function cancelExpiredReservations() {
  try {
    const expiredTickets = await Ticket.findAll({
      where: {
        status: 'reservation',
        optionTime: { [Op.lt]: new Date() }
      }
    });

    if (expiredTickets.length === 0) return;

    const ids = expiredTickets.map(t => t.id);
    await Ticket.update({ status: 'canceled' }, { where: { id: ids } });

    // log each cancellation
    await Promise.all(expiredTickets.map(t =>
      SystemLog.create({
        userId: null,
        branchId: null,
        module: 'ticket',
        action: 'auto_cancel',
        referenceId: t.id,
        newData: { status: 'canceled' },
        description: 'Reservation automatically canceled by scheduler'
      })
    ));

    // TODO: notify users or branches if notification system exists
  } catch (err) {
    console.error('Error canceling expired reservations:', err);
  }
}

let jobInstance;
function start() {
  if (cron) {
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
