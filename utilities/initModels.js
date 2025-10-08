// utilities/initModels.js
const AnnouncementFactory = require("../models/announcementModel");
const AnnouncementUserFactory = require("../models/announcementUserModel");
const BranchFactory = require("../models/branchModel");
const BusAccountCutFactory = require("../models/busAccountCutModel");
const BusFactory = require("../models/busModel");
const BusModelFactory = require("../models/busModelModel");
const BusTransactionFactory = require("../models/busTransactionModel");
const CargoFactory = require("../models/cargoModel");
const CashRegisterFactory = require("../models/cashRegisterModel");
const CustomerFactory = require("../models/customerModel");
const FirmFactory = require("../models/firmModel");
const FirmUserFactory = require("../models/firmUserModel");
const FirmUserPermissionFactory = require("../models/firmUserPermissionModel");
const PaymentFactory = require("../models/paymentModel");
const PermissionFactory = require("../models/permissionModel");
const PlaceFactory = require("../models/placeModel");
const PriceFactory = require("../models/priceModel");
const RouteFactory = require("../models/routeModel");
const RouteStopFactory = require("../models/routeStopModel");
const RouteStopRestrictionFactory = require("../models/routeStopRestrictionModel");
const StaffFactory = require("../models/staffModel");
const StopFactory = require("../models/stopModel");
const TakeOnFactory = require("../models/takeOnModel");
const TakeOffFactory = require("../models/takeOffModel");
const SystemLogFactory = require("../models/systemLogModel");
const TicketGroupFactory = require("../models/ticketGroupModel");
const TicketFactory = require("../models/ticketModel");
const TripStopTimeFactory = require("../models/tripStopTimeModel");
const TransactionFactory = require("../models/transactionModel");
const TripFactory = require("../models/tripModel");
const TripNoteFactory = require("../models/tripNoteModel");

function initModels(sequelize) {
  const Announcement = AnnouncementFactory(sequelize);
  const AnnouncementUser = AnnouncementUserFactory(sequelize);
  const Branch = BranchFactory(sequelize);
  const BusAccountCut = BusAccountCutFactory(sequelize);
  const Bus = BusFactory(sequelize);
  const BusModel = BusModelFactory(sequelize);
  const BusTransaction = BusTransactionFactory(sequelize);
  const Cargo = CargoFactory(sequelize);
  const CashRegister = CashRegisterFactory(sequelize);
  const Customer = CustomerFactory(sequelize);
  const FirmUser = FirmUserFactory(sequelize);
  const FirmUserPermission = FirmUserPermissionFactory(sequelize);
  const Payment = PaymentFactory(sequelize);
  const Permission = PermissionFactory(sequelize);
  const Price = PriceFactory(sequelize);
  const Route = RouteFactory(sequelize);
  const RouteStop = RouteStopFactory(sequelize);
  const RouteStopRestriction = RouteStopRestrictionFactory(sequelize);
  const Staff = StaffFactory(sequelize);
  const Stop = StopFactory(sequelize);
  const TakeOn = TakeOnFactory(sequelize);
  const TakeOff = TakeOffFactory(sequelize);
  const SystemLog = SystemLogFactory(sequelize);
  const TicketGroup = TicketGroupFactory(sequelize);
  const Ticket = TicketFactory(sequelize);
  const Transaction = TransactionFactory(sequelize);
  const Trip = TripFactory(sequelize);
  const TripNote = TripNoteFactory(sequelize);
  const TripStopTime = TripStopTimeFactory(sequelize);

  Announcement.belongsTo(Branch, { foreignKey: "branchId", as: "branch" });

  AnnouncementUser.belongsTo(Announcement, {
    foreignKey: "announcementId",
    as: "announcement",
  });
  AnnouncementUser.belongsTo(FirmUser, {
    foreignKey: "userId",
    as: "firmUser",
  });

  Branch.belongsTo(Stop, { foreignKey: "stopId", as: "stop" });
  Branch.belongsTo(Branch, { foreignKey: "mainBranchId", as: "mainBranch" });

  BusAccountCut.belongsTo(Trip, { foreignKey: "tripId", as: "trip" });
  BusAccountCut.belongsTo(Stop, { foreignKey: "stopId", as: "stop" });

  Bus.belongsTo(BusModel, { foreignKey: "busModelId", as: "busModel" });
  Bus.belongsTo(Staff, { foreignKey: "captainId", as: "captain" });

  BusTransaction.belongsTo(Bus, { foreignKey: "busId", as: "bus" });
  BusTransaction.belongsTo(FirmUser, {
    foreignKey: "userId",
    as: "firmUser",
  });

  Cargo.belongsTo(FirmUser, { foreignKey: "userId", as: "firmUser" });
  Cargo.belongsTo(Trip, { foreignKey: "tripId", as: "trip" });
  Cargo.belongsTo(Stop, { foreignKey: "fromStopId", as: "fromStop" });
  Cargo.belongsTo(Stop, { foreignKey: "toStopId", as: "toStop" });

  CashRegister.belongsTo(FirmUser, {
    foreignKey: "userId",
    as: "firmUser",
  });

  FirmUser.belongsTo(Branch, { foreignKey: "branchId", as: "branch" });

  FirmUserPermission.belongsTo(FirmUser, {
    foreignKey: "firmUserId",
    as: "firmUser",
  });
  FirmUserPermission.belongsTo(Permission, {
    foreignKey: "permissionId",
    as: "permission",
  });

  Payment.belongsTo(FirmUser, {
    foreignKey: "initiatorId",
    as: "initiator",
  });
  Payment.belongsTo(FirmUser, { foreignKey: "payerId", as: "payer" });
  Payment.belongsTo(FirmUser, { foreignKey: "receiverId", as: "receiver" });

  Price.belongsTo(Stop, { foreignKey: "fromStopId", as: "fromStop" });
  Price.belongsTo(Stop, { foreignKey: "toStopId", as: "toStop" });

  Route.belongsTo(Stop, { foreignKey: "fromStopId", as: "fromStop" });
  Route.belongsTo(Stop, { foreignKey: "toStopId", as: "toStop" });

  RouteStop.belongsTo(Route, { foreignKey: "routeId", as: "route" });
  RouteStop.belongsTo(Stop, { foreignKey: "stopId", as: "stop" });

  RouteStopRestriction.belongsTo(Trip, {
    foreignKey: "tripId",
    as: "trip",
  });
  RouteStopRestriction.belongsTo(RouteStop, {
    foreignKey: "fromRouteStopId",
    as: "fromRouteStop",
  });
  RouteStopRestriction.belongsTo(RouteStop, {
    foreignKey: "toRouteStopId",
    as: "toRouteStop",
  });

  SystemLog.belongsTo(FirmUser, {
    foreignKey: "userId",
    as: "firmUser",
  });
  SystemLog.belongsTo(Branch, { foreignKey: "branchId", as: "branch" });

  TicketGroup.belongsTo(Trip, { foreignKey: "tripId", as: "trip" });

  Ticket.belongsTo(Trip, { foreignKey: "tripId", as: "trip" });
  Ticket.belongsTo(FirmUser, { foreignKey: "userId", as: "firmUser" });
  Ticket.belongsTo(TicketGroup, {
    foreignKey: "ticketGroupId",
    as: "ticketGroup",
  });
  Ticket.belongsTo(Customer, {
    foreignKey: "customerId",
    as: "customer",
  });
  Ticket.belongsTo(Stop, {
    foreignKey: "fromRouteStopId",
    as: "fromStop",
  });
  Ticket.belongsTo(Stop, {
    foreignKey: "toRouteStopId",
    as: "toStop",
  });

  Transaction.belongsTo(FirmUser, {
    foreignKey: "userId",
    as: "firmUser",
  });
  Transaction.belongsTo(Ticket, { foreignKey: "ticketId", as: "ticket" });

  Trip.belongsTo(Route, { foreignKey: "routeId", as: "route" });
  Trip.belongsTo(BusModel, { foreignKey: "busModelId", as: "busModel" });
  Trip.belongsTo(Bus, { foreignKey: "busId", as: "bus" });
  Trip.belongsTo(Staff, { foreignKey: "captainId", as: "captain" });
  Trip.belongsTo(Staff, { foreignKey: "driver2Id", as: "driver2" });
  Trip.belongsTo(Staff, { foreignKey: "driver3Id", as: "driver3" });
  Trip.belongsTo(Staff, { foreignKey: "assistantId", as: "assistant" });
  Trip.belongsTo(Staff, { foreignKey: "hostessId", as: "hostess" });

  TripNote.belongsTo(Trip, { foreignKey: "tripId", as: "trip" });
  TripNote.belongsTo(FirmUser, { foreignKey: "userId", as: "firmUser" });

  TripStopTime.belongsTo(Trip, { foreignKey: "tripId", as: "trip" });
  TripStopTime.belongsTo(RouteStop, {
    foreignKey: "routeStopId",
    as: "routeStop",
  });

  return {
    Announcement,
    AnnouncementUser,
    Branch,
    BusAccountCut,
    Bus,
    BusModel,
    BusTransaction,
    Cargo,
    CashRegister,
    Customer,
    FirmUser,
    FirmUserPermission,
    Payment,
    Permission,
    Price,
    Route,
    RouteStop,
    RouteStopRestriction,
    Staff,
    Stop,
    TakeOn,
    TakeOff,
    SystemLog,
    TicketGroup,
    Ticket,
    Transaction,
    Trip,
    TripNote,
    TripStopTime,
  };
}

module.exports = initModels;
