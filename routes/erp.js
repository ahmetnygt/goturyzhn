const express = require('express');
const router = express.Router();

const autoLogMiddleware = require("../middlewares/autoLogMiddleware");
const auth = require("../middlewares/authentication")
const erpController = require("../controllers/erpController")

// Tüm POST/PUT/DELETE işlemleri için global middleware
// router.use(autoLogMiddleware);

router.get('/', auth, erpController.getErp);

router.get('/login', erpController.getErpLogin);
router.post('/login', erpController.postErpLogin);

router.get('/permissions', auth, erpController.getPermissions);

router.get('/get-day-trips-list', erpController.getDayTripsList);

router.get('/get-trip', erpController.getTrip);
router.get('/get-passengers-table', erpController.getTripTable);
router.get('/get-route-stops-time-list', erpController.getRouteStopsTimeList);
router.get('/get-trip-revenues', erpController.getTripRevenues);
router.get('/get-trip-stop-restriction', erpController.getTripStopRestriction);
router.post('/post-trip-stop-restriction', erpController.postTripStopRestriction);

router.get('/get-trip-notes', erpController.getTripNotes);
router.post('/post-trip-note', erpController.postTripNote);
router.post('/post-edit-trip-note', erpController.postEditTripNote);
router.post('/post-delete-trip-note', erpController.postDeleteTripNote);

router.get('/get-ticketops-popup', erpController.getTicketOpsPopUp);

router.get('/get-ticket-row', erpController.getTicketRow);

router.post('/post-tickets', erpController.postTickets)
router.post('/post-sell-open-tickets', erpController.postSellOpenTickets)
router.post('/post-edit-ticket', erpController.postEditTicket)
router.get('/get-cancel-open-ticket', erpController.getCancelOpenTicket)
router.post('/post-cancel-ticket', erpController.postCancelTicket)
router.post('/post-open-ticket', erpController.postOpenTicket)
router.get('/get-move-ticket', erpController.getMoveTicket)
router.get('/get-route-stops-list-moving', erpController.getRouteStopsListMoving)
router.post('/post-move-tickets', erpController.postMoveTickets)

router.get('/get-search-table', erpController.getSearchTable);

router.get('/get-bus-plan-panel', erpController.getBusPlanPanel);
router.post('/post-save-bus-plan', erpController.postSaveBusPlan);

router.get('/get-bus-models-data', erpController.getBusModelsData);

router.get('/get-buses-list', erpController.getBusesList);
router.get('/get-bus', erpController.getBus);
router.post('/post-save-bus', erpController.postSaveBus);
router.get('/get-buses-data', erpController.getBusesData);
router.post('/post-trip-bus', erpController.postTripBus);
router.post('/post-trip-bus-plan', erpController.postTripBusPlan);
router.post('/post-trip-staff', erpController.postTripStaff);
router.post('/post-trip-active', erpController.postTripActive);

router.get('/get-staffs-list', erpController.getStaffsList);
router.get('/get-staff', erpController.getStaff);
router.post('/post-save-staff', erpController.postSaveStaff);

router.get('/get-stops-list', erpController.getStopsList);
router.get('/get-stop', erpController.getStop);
router.post('/post-save-stop', erpController.postSaveStop);
router.get('/get-stops-data', erpController.getStopsData);

router.get('/get-prices-list', erpController.getPricesList);
router.post('/post-save-prices', erpController.postSavePrices);
router.post('/post-add-price', erpController.postAddPrice);

router.get('/get-routes-data', erpController.getRoutesData);
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

router.get('/get-transactions-list', auth, erpController.getTransactions);
router.get('/get-transaction-data', auth, erpController.getTransactionData);
router.get('/get-user-register-balance', auth, erpController.getUserRegisterBalance);
router.post('/post-add-transaction', auth, erpController.postAddTransaction);

router.post('/post-request-payment', auth, erpController.postRequestPayment);
router.post('/post-send-payment', auth, erpController.postSendPayment);
router.get('/get-pending-payments', auth, erpController.getPendingPayments);
router.get('/get-pending-collections', auth, erpController.getPendingCollections);
router.post('/post-confirm-payment', auth, erpController.postConfirmPayment);

module.exports = router;
