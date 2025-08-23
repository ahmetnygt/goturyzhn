const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const BusModel = sequelize.define("busmodel", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    planBinary: {
        type: Sequelize.STRING,
        allowNull: false
    },
    plan: {
        type: Sequelize.JSON,
        allowNull: false
    },
    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    description: {
        type: Sequelize.STRING,
        allowNull: false
    },
    maxPassenger: {
        type: Sequelize.INTEGER,
        allowNull: true
    }
})

module.exports = BusModel