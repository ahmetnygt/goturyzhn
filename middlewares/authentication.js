const session = require("express-session")

module.exports = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();
    }
    req.session.redirectTo = req.originalUrl;
    req.session.errorMessage = "Bu sayfayı ziyaret etmek için giriş yapmalısınız.";
    req.session.save(err => {
        if (err) return next(err);
        res.redirect("/login");
    });
};
