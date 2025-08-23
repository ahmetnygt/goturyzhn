const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const TripNote = sequelize.define("tripnote", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    tripId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    noteText:{
        type:Sequelize.TEXT,
        allowNull: false
    }
})

module.exports = TripNote