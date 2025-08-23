const {Sequelize} = require("sequelize")

const sequelize = new Sequelize('defaultdb', 'doadmin', 'AVNS_rfP7FS1Hdg-KSHpn02u', {
  host: 'dbaas-db-5929049-do-user-22627641-0.g.db.ondigitalocean.com',
  dialect: 'mysql',
  port: 25060,
  logging: false
});

module.exports = sequelize