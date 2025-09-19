const { Sequelize } = require("sequelize");

const goturDB = new Sequelize("gotur", "doadmin", "AVNS_rfP7FS1Hdg-KSHpn02u", {
    host: "dbaas-db-5929049-do-user-22627641-0.g.db.ondigitalocean.com",
    port: 25060,
    dialect: "mysql",
    logging: false,
});

module.exports = goturDB;
