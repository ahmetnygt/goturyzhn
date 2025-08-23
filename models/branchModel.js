const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const Branch = sequelize.define("branch", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    placeId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: 1
    },
    isMainBranch: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: 0
    },
    mainBranchId: {
        type: Sequelize.INTEGER,
        allowNull: true
    }
})

module.exports = Branch