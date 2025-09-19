// utilities/initModels.js
const AnnouncementFactory = require("../models/announcementModel");
const AnnouncementUserFactory = require("../models/announcementUserModel");
const BranchFactory = require("../models/branchModel");
const BusAccountCutFactory = require("../models/busAccountCutModel");
const BusFactory = require("../models/busModel");
const BusModelFactory = require("../models/busModelModel");
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
const SystemLogFactory = require("../models/systemLogModel");
const TicketGroupFactory = require("../models/ticketGroupModel");
const TicketFactory = require("../models/ticketModel");
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
  const Cargo = CargoFactory(sequelize);
  const CashRegister = CashRegisterFactory(sequelize);
  const Customer = CustomerFactory(sequelize);
  const Firm = FirmFactory(sequelize);
  const FirmUser = FirmUserFactory(sequelize);
  const FirmUserPermission = FirmUserPermissionFactory(sequelize);
  const Payment = PaymentFactory(sequelize);
  const Permission = PermissionFactory(sequelize);
  const Place = PlaceFactory(sequelize);
  const Price = PriceFactory(sequelize);
  const Route = RouteFactory(sequelize);
  const RouteStop = RouteStopFactory(sequelize);
  const RouteStopRestriction = RouteStopRestrictionFactory(sequelize);
  const Staff = StaffFactory(sequelize);
  const Stop = StopFactory(sequelize);
  const SystemLog = SystemLogFactory(sequelize);
  const TicketGroup = TicketGroupFactory(sequelize);
  const Ticket = TicketFactory(sequelize);
  const Transaction = TransactionFactory(sequelize);
  const Trip = TripFactory(sequelize);
  const TripNote = TripNoteFactory(sequelize);

  return {
    Announcement,
    AnnouncementUser,
    Branch,
    BusAccountCut,
    Bus,
    BusModel,
    Cargo,
    CashRegister,
    Customer,
    Firm,
    FirmUser,
    FirmUserPermission,
    Payment,
    Permission,
    Place,
    Price,
    Route,
    RouteStop,
    RouteStopRestriction,
    Staff,
    Stop,
    SystemLog,
    TicketGroup,
    Ticket,
    Transaction,
    Trip,
    TripNote,
  };
}

module.exports = initModels;
