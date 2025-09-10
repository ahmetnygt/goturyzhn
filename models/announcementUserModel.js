const Sequelize = require("sequelize");

const sequelize = require("../utilities/database");

const AnnouncementUser = sequelize.define("announcementuser", {
    id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    announcementId: {
        type: Sequelize.BIGINT,
        allowNull: false,
    },
    userId: {
        type: Sequelize.BIGINT,
        allowNull: false,
    },
    seenAt: {
        type: Sequelize.DATE,
        allowNull: true,
    },
}, {
    indexes: [
        {
            unique: true,
            fields: ["announcementId", "userId"],
        }
    ]
});

module.exports = AnnouncementUser;
