const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const Place = sequelize.define("place", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        allowNull: false
    },
    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    provinceId: {
        type: Sequelize.BIGINT,
        allowNull: false
    }
});

module.exports = Place;
