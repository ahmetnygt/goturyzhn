const Sequelize = require("sequelize");
const sequelize = require("../utilities/database");

const SystemLog = sequelize.define("systemLog", {
    id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    userId: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    branchId: {
        type: Sequelize.BIGINT,   // hangi yazıhanede oldu
        allowNull: true
    },
    module: {
        type: Sequelize.ENUM("transaction", "ticket", "auth", "report", "user"),
        allowNull: false
    },
    action: {
        type: Sequelize.STRING(50),  // örn: "create", "update", "delete", "refund"
        allowNull: false
    },
    referenceId: {
        type: Sequelize.BIGINT,   // ilgili kaydın ID’si (örn. ticketId, cashTransactionId)
        allowNull: true
    },
    oldData: {
        type: Sequelize.JSON,     // işlem öncesi data (update için)
        allowNull: true
    },
    newData: {
        type: Sequelize.JSON,     // işlem sonrası data
        allowNull: true
    },
    description: {
        type: Sequelize.STRING(255), // açıklama
        allowNull: true
    }
});

module.exports = SystemLog;
