const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");
const FirmUser = require("./firmUserModel");
const Permission = require("./permissionModel");

const FirmUserPermission = sequelize.define("firmuserpermission", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    firmUserId: {
        type: Sequelize.BIGINT,
        allowNull: false,
    },
    permissionId: {
        type: Sequelize.BIGINT,
        allowNull: false,
    },
    allow: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
    },
});

module.exports = FirmUserPermission;
