const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const RouteStop = sequelize.define("routestop", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    routeId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    stopId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    order: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    duration: {
        type: Sequelize.TIME,
        allowNull: false
    }
});

module.exports = RouteStop;
