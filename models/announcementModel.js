const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Announcement = sequelize.define("announcement", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    message: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    userId: {
        type: Sequelize.BIGINT,
        allowNull: false,
    },
    branchId: {
        type: Sequelize.BIGINT,
        allowNull: true,
    },
    showTicker: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    showPopup: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    }
});

module.exports = Announcement;
