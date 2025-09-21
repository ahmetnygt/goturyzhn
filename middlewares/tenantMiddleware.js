const { getTenantConnection } = require("../utilities/database");
const { initGoturModels } = require("../utilities/goturDB");

module.exports = async (req, res, next) => {
    try {
        //! const subdomain = req.hostname.split(".")[0];
        const subdomain = "derseturizm"
        if (!subdomain) {
            return res.status(400).json({ error: "Subdomain bulunamadı" });
        }

        // tenant DB
        const { sequelize, models } = await getTenantConnection(subdomain);

        // ortak DB (gotur)
        const commonModels = initGoturModels();

        req.db = sequelize;
        req.models = models;             // tenant modelleri
        req.commonModels = commonModels; // ortak modeller
        req.tenantKey = subdomain;

        next();
    } catch (err) {
        console.error("Tenant çözümleme hatası:", err);
        res.status(500).json({ error: "Tenant çözümleme hatası" });
    }
};
