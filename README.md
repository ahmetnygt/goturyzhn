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

## Client Build Testing

To verify the production client bundle locally, install dependencies with `npm install` (or `npm ci` if you prefer a clean install), run `npm run build-client`, then confirm that a hashed `app.<hash>.js` file appears in `public/js/` and that `views/layout.pug` (or `layout.html`) references the new filename with the reported integrity value.
