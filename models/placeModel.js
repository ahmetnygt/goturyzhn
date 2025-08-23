const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const Place = sequelize.define("place", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false
    },
    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    provinceId: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
})

module.exports = Place