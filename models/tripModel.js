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
        allowNull: false
    },
    captainId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    date: {
        type: Sequelize.DATEONLY
    },
    time: {
        type: Sequelize.TIME
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
