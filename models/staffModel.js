const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Staff = sequelize.define("staff", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    idNumber: {
        type: Sequelize.STRING,
        allowNull: false
    },
    duty: {
        type: Sequelize.ENUM("driver","assistant","hostess"),
        allowNull: false
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    surname: {
        type: Sequelize.STRING,
        allowNull: false
    },
    address: {
        type: Sequelize.TEXT,
        allowNull: false
    },
    phoneNumber: {
        type: Sequelize.STRING,
        allowNull: false
    },
    gender: {
        type: Sequelize.ENUM("m", "f"),
        allowNull: false
    },
    nationality: {
        type: Sequelize.STRING,
        allowNull: false
    },
});

module.exports = Staff;
