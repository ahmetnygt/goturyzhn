const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Branch = sequelize.define("branch", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    placeId: {
        type: Sequelize.BIGINT,
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
        type: Sequelize.BIGINT,
        allowNull: true
    }
});

module.exports = Branch;
