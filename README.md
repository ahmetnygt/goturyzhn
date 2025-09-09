# Gotur VIP

This project now includes a background job that cancels expired ticket reservations.

## Reservation Cleanup Job

* Runs every minute and marks expired `reservation` tickets as `canceled`.
* Implemented in [`bin/reservationCleanupJob.js`](bin/reservationCleanupJob.js).
* The job starts automatically when the server boots via `bin/www`.

### Manual control

```javascript
const job = require('./bin/reservationCleanupJob');
job.stop(); // stops the scheduler
job.start(); // restarts it
```

Add notification hooks inside the job if a user/branch alert system is available.
