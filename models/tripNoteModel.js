const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const TripNote = sequelize.define("tripnote", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    tripId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    userId: {
        type: Sequelize.BIGINT,
        allowNull: false
    },
    noteText: {
        type: Sequelize.TEXT,
        allowNull: false
    },
    isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
    }
});

module.exports = TripNote;
