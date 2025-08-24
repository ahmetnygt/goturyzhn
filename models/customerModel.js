const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Customer = sequelize.define("customer", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    idNumber: {
        type: Sequelize.INTEGER,
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
    customerType: {
        type: Sequelize.ENUM("adult", "child", "student", "disabled", "retired"),
        allowNull: false
    },
    customerCategory: {
        type: Sequelize.ENUM("normal", "member"),
        allowNull: false
    },
    isBlackList: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    blackListDescription: {
        type: Sequelize.STRING,
        allowNull: true,
    },
});

module.exports = Customer;

