const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Trip = sequelize.define("trip", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    routeId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    busModelId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    busId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    captainId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    driver2Id: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    driver3Id: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    assistantId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    hostessId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    reservationOptionDate: {
        type: Sequelize.DATEONLY
    },
    refundOptionDate: {
        type: Sequelize.DATE
    },
    date: {
        type: Sequelize.DATE
    },
    date: {
        type: Sequelize.DATEONLY
    },
    time: {
        type: Sequelize.TIME
    },
    isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    fromPlaceString: {
        type: Sequelize.STRING
    },
    toPlaceString: {
        type: Sequelize.STRING
    },
    busPlanString: {
        type: Sequelize.STRING
    }
});

module.exports = Trip;
