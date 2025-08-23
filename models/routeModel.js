const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const Route = sequelize.define("route", {
    id: {
        type: Sequelize.INTEGER,
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
        type: Sequelize.INTEGER,
        allowNull: false
    },
    toPlaceId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
})

module.exports = Route