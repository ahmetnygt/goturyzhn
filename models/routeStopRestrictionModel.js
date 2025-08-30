const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const routeStopRestriction = sequelize.define("routestoprestriction", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    tripId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    fromRouteStopId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    toRouteStopId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    isAllowed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
    }
});

module.exports = routeStopRestriction;
