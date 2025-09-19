const { Sequelize } = require("sequelize");

const connections = {}; // cache

function getTenantConnection(subdomain) {
  if (connections[subdomain]) {
    return connections[subdomain];
  }

  // Subdomain ile aynı isimde database
  const dbName = subdomain;

  const sequelize = new Sequelize(dbName, "doadmin", "AVNS_rfP7FS1Hdg-KSHpn02u", {
    host: "dbaas-db-5929049-do-user-22627641-0.g.db.ondigitalocean.com",
    port: 25060,
    dialect: "mysql",
    logging: false,
    pool: { max: 10, min: 0, idle: 10000 }
  });

  connections[subdomain] = sequelize;
  return sequelize;
}

module.exports = { getTenantConnection };
