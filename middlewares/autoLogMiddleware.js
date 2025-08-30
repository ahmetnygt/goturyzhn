const SystemLog = require("../models/systemLogModel");

/**
 * Tüm POST, PUT, DELETE işlemlerini otomatik loglar
 */
const autoLogMiddleware = async (req, res, next) => {
  const method = req.method.toUpperCase();

  if (!["POST", "PUT", "DELETE"].includes(method)) {
    return next(); // sadece create/update/delete işlemleri loglansın
  }

  // Response tamamlandıktan sonra log yazmak için
  res.on("finish", async () => {
    try {
      const userId = req.session.user.id;

      // Module mapping, ihtiyacına göre ekleyebilirsin
      const moduleMap = {
        "/post-tickets": "ticket",
        "/post-edit-ticket": "ticket",
        "/post-cancel-ticket": "ticket",
        "/post-open-ticket": "ticket",
        "/post-move-ticket": "ticket",
        "/post-save-bus-plan": "bus",
        "/post-save-bus": "bus",
        "/post-save-route": "route",
        "/post-save-trip": "trip",
        "/post-trip-staff": "trip",
        "/post-trip-active": "trip",
        "/post-save-branch": "branch",
        "/post-save-user": "user",
        "/post-add-transaction": "transaction"
      };

      const moduleName = moduleMap[req.route.path] || "other";

      await SystemLog.create({
        userId,
        branchId: req.session.user.branchId || null,      // güncellendi: branchId
        module: moduleName,
        action: method === "POST" ? "create" : method === "PUT" ? "update" : "delete",
        referenceId: res.locals.newRecordId || null,
        oldData: res.locals.oldData || null,
        newData: res.locals.newData || null,
        description: `API: ${req.originalUrl} Method: ${method}`
      });
    } catch (err) {
      console.error("AutoLogMiddleware error:", err);
    }
  });

  next();
};

module.exports = autoLogMiddleware;
