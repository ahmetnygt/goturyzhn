const { getTenantConnection } = require("../utilities/database");
const { initGoturModels } = require("../utilities/goturDb");
const { DEFAULT_TENANT_KEY, resolveTenantKey } = require("../utilities/tenantConfig");

let cachedCommonModels;

function getCommonModels() {
    if (!cachedCommonModels) {
        cachedCommonModels = initGoturModels();
    }

    return cachedCommonModels;
}

module.exports = async (req, res, next) => {
    try {
        const explicitTenantKey =
            req.get("x-tenant-key") ||
            req.get("x-tenant") ||
            req.query.tenantKey ||
            req.query.tenant ||
            DEFAULT_TENANT_KEY;

        const subdomain = resolveTenantKey(req.hostname, explicitTenantKey);

        if (!subdomain) {
            return res.status(400).json({ error: "Subdomain bulunamadı" });
        }

        // tenant DB
        const { sequelize, models } = await getTenantConnection(subdomain);

        // ortak DB (gotur)
        const commonModels = getCommonModels();

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
