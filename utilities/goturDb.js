const { Sequelize } = require("sequelize");
const PlaceFactory = require("../models/placeModel");

const goturDB = new Sequelize("gotur", "doadmin", "AVNS_rfP7FS1Hdg-KSHpn02u", {
    host: "dbaas-db-5929049-do-user-22627641-0.g.db.ondigitalocean.com",
    port: 25060,
    dialect: "mysql",
    logging: false,
});

function initGoturModels() {
    const Place = PlaceFactory(goturDB); // 👈 mevcut modelini kullan
    goturDB.sync();
    return { Place };
}

module.exports = { goturDB, initGoturModels };