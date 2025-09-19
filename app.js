var createError = require("http-errors");
var express = require("express");
var path = require("path");
const session = require("express-session");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var usersRouter = require("./routes/users");
var erpRouter = require("./routes/erp");

const goturDB = require("./utilities/goturDb"); // ortak kullanıcı & session DB
const SequelizeStore = require("connect-session-sequelize")(session.Store);
const tenantMiddleware = require("./middleware/tenantMiddleware");

var store = new SequelizeStore({
  db: goturDB, // sessionlar "gotur" DB’de tutulacak
});

store.sync();

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "node_modules")));

app.use(
  session({
    secret: "anadolutat",
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
      maxAge: 86400000, // 1 gün
    },
  })
);

// tenant middleware (her subdomain kendi DB’sine bağlanacak)
app.use(tenantMiddleware);

// session bilgisini viewlara aktar
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  res.locals.permissions = req.session.permissions || [];
  next();
});

// routerlar
app.use("/users", usersRouter);
app.use("/", erpRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
