const express = require('express');
const router = express.Router();

const autoLogMiddleware = require("../middlewares/autoLogMiddleware");
const auth = require("../middlewares/authentication")
const erpController = require("../controllers/erpController")

// Tüm POST/PUT/DELETE işlemleri için global middleware
router.use(autoLogMiddleware);

router.get('/', auth, erpController.getErp);

router.get('/login', erpController.getErpLogin);
router.post('/login', erpController.postErpLogin);

router.get('/get-trips-of-day', erpController.getTripsOfDay);

router.get('/get-day-trips-list', erpController.getDayTripsList);

router.get('/get-trip', erpController.getTrip);
router.get('/get-passengers-table', erpController.getTripTable);

router.get('/get-trip-notes', erpController.getTripNotes);
router.post('/post-trip-notes', erpController.postTripNotes);

router.get('/get-ticketops-popup', erpController.getTicketOpsPopUp);

router.get('/get-ticket-row', erpController.getTicketRow);

router.post('/post-tickets', erpController.postTickets)
router.post('/post-edit-ticket', erpController.postEditTicket)
router.get('/get-cancel-open-ticket', erpController.getCancelOpenTicket)
router.post('/post-cancel-ticket', erpController.postCancelTicket)
router.post('/post-open-ticket', erpController.postOpenTicket)
router.post('/post-move-ticket', erpController.postMoveTicket)

router.get('/get-search-table', erpController.getSearchTable);

router.get('/get-bus-plan-panel', erpController.getBusPlanPanel);
router.post('/post-save-bus-plan', erpController.postSaveBusPlan);

router.get('/get-buses-list', erpController.getBusesList);
router.get('/get-bus', erpController.getBus);
router.post('/post-save-bus', erpController.postSaveBus);

router.get('/get-prices-list', erpController.getPricesList);

router.get('/get-routes-list', erpController.getRoutesList);
router.get('/get-route', erpController.getRoute);
router.get('/get-route-stop', erpController.getRouteStop);
router.get('/get-route-stops-list', erpController.getRouteStopsList);
router.post('/post-save-route', erpController.postSaveRoute);

router.get('/get-trips-list', erpController.getTripsList);
router.post('/post-save-trip', erpController.postSaveTrip);

router.get('/get-branches-list', erpController.getBranchesList);
router.get('/get-branch', erpController.getBranch);
router.post('/post-save-branch', erpController.postSaveBranch);

router.get('/get-users-list', erpController.getUsersList);
router.get('/get-user', erpController.getUser);
router.get('/get-users-by-branch', erpController.getUsersByBranch);
router.post('/post-save-user', erpController.postSaveUser);

router.get('/get-customers-list', erpController.getCustomersList);
router.get('/get-members-list', erpController.getMembersList);
router.post('/post-add-member', erpController.postAddMember);
router.post('/post-customer-blacklist', erpController.postCustomerBlacklist);

router.get('/get-transactions-list', erpController.getTransactions);
router.get('/get-transaction-data', erpController.getTransactionData);
router.post('/post-add-transaction', erpController.postAddTransaction);

module.exports = router;