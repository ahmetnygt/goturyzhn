const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Ticket = sequelize.define("ticket", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    tripId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    userId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    ticketGroupId: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0
    },
    customerId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    seatNo: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    price: {
        type: Sequelize.FLOAT,
        allowNull: false
    },
    status: {
        type: Sequelize.ENUM("web", "completed", "reservation", "canceled", "refund", "open"),
        allowNull: false
    },
    idNumber: {
        type: Sequelize.STRING,
        allowNull: false
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    surname: {
        type: Sequelize.STRING,
        allowNull: false
    },
    phoneNumber: {
        type: Sequelize.STRING,
        allowNull: false
    },
    gender: {
        type: Sequelize.ENUM("m", "f"),
        allowNull: false
    },
    nationality: {
        type: Sequelize.STRING,
        allowNull: false
    },
    customerType: {
        type: Sequelize.ENUM("adult", "child", "student", "disabled", "retired"),
        allowNull: false
    },
    customerCategory: {
        type: Sequelize.ENUM("normal", "member", "guest"),
        allowNull: false
    },
    optionTime: {
        type: Sequelize.DATE,
    },
    fromRouteStopId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    toRouteStopId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    pnr: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    payment: {
        type: Sequelize.ENUM("cash", "card"),
        allowNull: true
    }
});

module.exports = Ticket;
