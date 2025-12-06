const { getTenantConnection } = require("../utilities/database");
const { initGoturModels } = require("../utilities/goturDb");
const { DEFAULT_TENANT_KEY, resolveTenantKey } = require("../utilities/tenantConfig");

// Ortak DB cache
let cachedCommonModels;
function getCommonModels() {
    if (!cachedCommonModels) cachedCommonModels = initGoturModels();
    return cachedCommonModels;
}

module.exports = async (req, res, next) => {
    try {
        let tenantKey;

        /* ==========================================================
         * 1) API request
         * ========================================================== */
        const isApiRequest =
            req.originalUrl.startsWith("/api/") ||
            req.path.startsWith("/api/");

        if (isApiRequest) {
            tenantKey = req.get("x-tenant-key") || req.get("x-tenant");

            if (!tenantKey) {
                console.error("❌ API çağrısı fakat API key ile tenant bulunamadı.");
                return res.status(400).json({
                    error: "API tenant bulunamadı — X-Api-Key doğru mu?"
                });
            }
        }

        /* ==========================================================
         * 2) Normal WEBSITE request
         * ========================================================== */
        else {
            // domain/subdomain çözümlemesi
            tenantKey = resolveTenantKey(req.hostname);

            if (!tenantKey) {
                console.error("❌ Tenant/subdomain çözümlenemedi.");
                return res.status(400).send("Tenant belirlenemedi.");
            }
        }

        const { sequelize, models } = await getTenantConnection(tenantKey);

        req.db = sequelize;
        req.models = models;
        req.commonModels = getCommonModels();
        req.tenantKey = tenantKey;

        return next();

    } catch (err) {
        console.error("❌ Tenant Middleware Crash:", err);
        return res.status(500).json({ error: "Tenant çözümleme hatası", detail: err.message });
    }
};
