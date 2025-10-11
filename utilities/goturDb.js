const { Sequelize } = require("sequelize");
const PlaceFactory = require("../models/placeModel");
const FirmFactory = require("../models/firmModel");

const GOTUR_DB_NAME = process.env.GOTUR_DB_NAME || "gotur";
const GOTUR_DB_USERNAME = process.env.GOTUR_DB_USERNAME || "root";
const GOTUR_DB_PASSWORD = process.env.GOTUR_DB_PASSWORD || "anadolutat1071";

const goturConnectionOptions = {
    host: process.env.GOTUR_DB_HOST,
    dialect: process.env.GOTUR_DB_DIALECT || "mysql",
    logging: false,
};

if (process.env.GOTUR_DB_PORT) {
    goturConnectionOptions.port = Number(process.env.GOTUR_DB_PORT);
}

if (process.env.GOTUR_DB_TIMEZONE) {
    goturConnectionOptions.timezone = process.env.GOTUR_DB_TIMEZONE;
}

const definedEntries = Object.entries(goturConnectionOptions).filter(([, value]) => value !== undefined && value !== "");
const sanitizedOptions = Object.fromEntries(definedEntries);

const goturDB = new Sequelize(
    GOTUR_DB_NAME,
    GOTUR_DB_USERNAME,
    GOTUR_DB_PASSWORD,
    sanitizedOptions
);

const goturModels = Object.freeze({
    Firm: FirmFactory(goturDB),
    Place: PlaceFactory(goturDB),
});

let goturSyncPromise;

function initGoturModels() {
    return goturModels;
}

function getGoturSyncPromise() {
    if (!goturSyncPromise) {
        goturSyncPromise = goturDB.sync({ }).catch((error) => {
            goturSyncPromise = null;
            throw error;
        });
    }

    return goturSyncPromise;
}

getGoturSyncPromise();

module.exports = { goturDB, initGoturModels, getGoturSyncPromise };
