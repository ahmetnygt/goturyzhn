const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const Bus = sequelize.define("bus", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    busModelId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    captainId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    licensePlate: {
        type: Sequelize.STRING,
        allowNull: false
    },
    phoneNumber: {
        type: Sequelize.STRING,
        allowNull: true
    },
    owner: {
        type: Sequelize.STRING,
        allowNull: false
    }
})

module.exports = Bus