const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const Trip = sequelize.define("trip", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    routeId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    busModelId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    busId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    captainId: {
        type: Sequelize.INTEGER,
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
})

module.exports = Trip