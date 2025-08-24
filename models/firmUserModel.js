const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const FirmUser = sequelize.define("firmuser", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    firmId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    branchId: {
        type: Sequelize.BIGINT,
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
});

module.exports = FirmUser;
