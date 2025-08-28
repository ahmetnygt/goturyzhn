const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const Stop = sequelize.define("stop", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    webTitle: {
        type: Sequelize.STRING,
        allowNull: false
    },
    placeId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    UETDS_code: {
        type: Sequelize.BIGINT,
        allowNull: true
    },
    isServiceArea: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
})

module.exports = Stop