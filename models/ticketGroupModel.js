const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const TicketGroup = sequelize.define("ticketgroup", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    tripId: {
        type: Sequelize.BIGINT,
        allowNull: false
    }
});

module.exports = TicketGroup;
