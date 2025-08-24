const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Bus = sequelize.define("bus", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    busModelId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    captainId: {
        type: Sequelize.BIGINT,
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
});

module.exports = Bus;
