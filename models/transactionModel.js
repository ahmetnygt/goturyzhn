const Sequelize = require("sequelize");
const sequelize = require("../utilities/database");

const Transaction = sequelize.define("transaction", {
    id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    userId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    type: {
        type: Sequelize.ENUM("income", "expense"),
        allowNull: false
    },
    category: {
        type: Sequelize.ENUM(
            "point_sale",
            "cash_sale",
            "card_sale",
            "cash_refund",
            "card_refund",
            "payed_to_bus",
            "income",
            "expense",
            "transfer_in",
            "transfer_out"
        ),
        allowNull: false
    },
    amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
    },
    description: {
        type: Sequelize.STRING(255)
    },
    ticketId: {
        type: Sequelize.BIGINT
    }
});

module.exports = Transaction;
