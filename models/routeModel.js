const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Route = sequelize.define("route", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    description: {
        type: Sequelize.STRING,
        allowNull: false
    },
    routeCode: {
        type: Sequelize.STRING,
        allowNull: false
    },
    fromPlaceId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    toPlaceId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
});

module.exports = Route;
