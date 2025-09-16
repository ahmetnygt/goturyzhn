const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Cargo = sequelize.define("cargo", {
    id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    userId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    tripId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    fromStopId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    toStopId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    senderName: {
        type: Sequelize.STRING,
        allowNull: false
    },
    senderPhone: {
        type: Sequelize.STRING,
        allowNull: false
    },
    senderIdentity: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    description: {
        type: Sequelize.TEXT,
        allowNull: false
    },
    payment: {
        type: Sequelize.ENUM("cash", "card"),
        allowNull: false
    },
    price: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
});

module.exports = Cargo;
