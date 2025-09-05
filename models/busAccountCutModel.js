const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const BusAccountCut = sequelize.define("busaccountcut", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    tripId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    stopId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    comissionAmount: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
    deduction1: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
    deduction2: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
    deduction3: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
    deduction4: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
    deduction5: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
    tip: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
    description: {
        type: Sequelize.TEXT,
        allowNull: true
    },
    needToPayAmount: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
    payedAmount: {
        type: Sequelize.DECIMAL,
        allowNull: false
    },
});

module.exports = BusAccountCut;
