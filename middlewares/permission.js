const { Op } = require("sequelize");
const Permission = require("../models/permissionModel");
const FirmUserPermission = require("../models/firmUserPermissionModel");

/**
 * Middleware to enforce permission checks on routes.
 *
 * Usage: router.get('/path', checkPermission('CODE'), handler)
 *        router.post('/path', checkPermission(['CODE1','CODE2']), handler)
 */
module.exports = (requiredPermissions = []) => {
    const codes = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];

    return async (req, res, next) => {
        try {
            if (!req.session || !req.session.user) {
                return res.status(401).json({ message: "Giriş yapmanız gerekiyor." });
            }

            const userId = req.session.user.id;

            const permissions = await Permission.findAll({
                where: { code: { [Op.in]: codes } },
                attributes: ["id"],
            });

            const permissionIds = permissions.map((p) => p.id);

            if (permissionIds.length !== codes.length) {
                return res.status(403).json({ message: "Bu işlem için yetkiniz yok." });
            }

            const count = await FirmUserPermission.count({
                where: {
                    firmUserId: userId,
                    permissionId: { [Op.in]: permissionIds },
                    allow: true,
                },
            });

            if (count !== permissionIds.length) {
                return res.status(403).json({ message: "Bu işlem için yetkiniz yok." });
            }

            next();
        } catch (err) {
            console.error("Permission middleware error:", err);
            res.status(500).json({ message: "Sunucu hatası." });
        }
    };
};
