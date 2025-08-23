const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const CashRegister = sequelize.define("cashRegister", {
    id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    userId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    cash_balance: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    card_balance: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    reset_date_time: {
        type: Sequelize.DATE,
        allowNull: true,
    }
});

module.exports = CashRegister;
