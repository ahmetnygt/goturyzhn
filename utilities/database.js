const { Sequelize } = require("sequelize");
const initModels = require("./initModels");
const bcrypt = require("bcrypt");

const connections = {};

async function getTenantConnection(subdomain) {
  if (connections[subdomain]) return connections[subdomain];

  const sequelize = new Sequelize(subdomain, "doadmin", "AVNS_rfP7FS1Hdg-KSHpn02u", {
    host: "dbaas-db-5929049-do-user-22627641-0.g.db.ondigitalocean.com",
    port: 25060,
    dialect: "mysql",
    logging: false,
  });

  const models = initModels(sequelize);

  // tabloları oluştur
  await sequelize.sync();

  // default kullanıcı ekleme
  const FirmUser = models.FirmUser;

  console.log(models)

  const count = await FirmUser.count();
  if (count === 0) {
    const hashedPassword = await bcrypt.hash("anadolutat1071", 10);

    await FirmUser.create({
      branchId: 0, // 📌 firmaya göre güncellenebilir
      username: "gotur",
      password: hashedPassword,
      name: "Götür Sistem Kullanıcısı",
      phoneNumber: "0850 840 1915",
    });

    console.log(`[${subdomain}] için default kullanıcı eklendi.`);
  }

  connections[subdomain] = { sequelize, models };
  return connections[subdomain];
}

module.exports = { getTenantConnection };
