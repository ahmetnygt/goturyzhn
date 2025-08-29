const Sequelize = require("sequelize");
const sequelize = require("../utilities/database");

const Payment = sequelize.define("payment", {
    id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    initiatorId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    payerId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    receiverId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
    },
    status: {
        type: Sequelize.ENUM("pending", "approved", "rejected"),
        defaultValue: "pending",
        allowNull: false
    }
});

module.exports = Payment;
