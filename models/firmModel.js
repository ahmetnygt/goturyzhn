const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Firm = sequelize.define("firm", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    title:{
        type: Sequelize.STRING,
        allowNull: false
    }
});

module.exports = Firm;
