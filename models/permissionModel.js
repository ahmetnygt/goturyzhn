const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Permission = sequelize.define("permission", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    code: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    module: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    description: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: 1
    }
});

module.exports = Permission;
