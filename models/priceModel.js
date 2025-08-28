const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const Price = sequelize.define("price", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    fromStopId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    toStopId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    validFrom: {
        type: Sequelize.DATE,
        allowNull: true
    },
    validUntil: {
        type: Sequelize.DATE,
        allowNull: true
    },
    seatLimit: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    hourLimit: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    price1: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    price2: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    price3: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    singleSeatPrice1:{
        type: Sequelize.INTEGER,
        allowNull: true
    },
    singleSeatPrice2:{
        type: Sequelize.INTEGER,
        allowNull: true
    },
    singleSeatPrice3:{
        type: Sequelize.INTEGER,
        allowNull: true
    },
    webPrice: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    singleSeatWebPrice:{
        type: Sequelize.INTEGER,
        allowNull: true
    },
})

module.exports = Price