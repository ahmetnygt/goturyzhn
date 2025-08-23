const Sequelize = require("sequelize")

const sequelize = require("../utilities/database")

const TicketGroup = sequelize.define("ticketgroup", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    tripId: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
})

module.exports = TicketGroup