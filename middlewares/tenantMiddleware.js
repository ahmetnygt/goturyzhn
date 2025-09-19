const { getTenantConnection } = require("../utilities/database");

module.exports = (req, res, next) => {
    try {
        const subdomain = req.hostname.split(".")[0];
        const { sequelize, models } = getTenantConnection(subdomain);

        req.db = sequelize;
        req.models = models;
        req.tenantKey = subdomain;

        next();
    } catch (err) {
        console.error("Tenant çözümleme hatası:", err);
        res.status(500).json({ error: "Tenant çözümleme hatası" });
    }
};
