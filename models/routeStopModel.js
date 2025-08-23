const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const RouteStop = sequelize.define("routestop", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    routeId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    placeId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    order: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    duration: {
        type: Sequelize.TIME,
        allowNull: false
    }
})

module.exports = RouteStop