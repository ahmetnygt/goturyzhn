const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const Ticket = sequelize.define("ticket", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    tripId: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    ticketGroupId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    customerId: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    seatNo: {
        type: Sequelize.INTEGER,
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
    fromRouteStopId: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    toRouteStopId: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    pnr: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    payment: {
        type: Sequelize.ENUM("cash", "card"),
        allowNull: false
    }
})

module.exports = Ticket