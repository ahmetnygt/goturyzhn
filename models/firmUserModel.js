const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const FirmUser = sequelize.define("firmuser", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    firmId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    branchId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    password: {
        type: Sequelize.STRING,
        allowNull: false
    },
    username: {
        type: Sequelize.STRING,
        allowNull: false
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    phoneNumber: {
        type: Sequelize.STRING,
        allowNull: true
    },
})

module.exports = FirmUser