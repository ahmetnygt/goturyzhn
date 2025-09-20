var createError = require('http-errors');
var express = require('express');
var path = require('path');
const session = require("express-session");
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var usersRouter = require('./routes/users');
var erpRouter = require('./routes/erp');

const sequelize = require('./utilities/database');
const seedPermissions = require('./utilities/permissionSeeder');
const SequelizeStore = require("connect-session-sequelize")(session.Store);

var store = new SequelizeStore({
  db: sequelize,
});

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules')));
app.use(session({
  secret: 'anadolutat',
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    maxAge: 86400000
  }
}))

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  res.locals.permissions = req.session.permissions || [];
  next();
});

app.use('/users', usersRouter);
app.use('/', erpRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

sequelize.authenticate().then(console.log('Connection has been established successfully.')).catch(error => { console.error('Unable to connect to the database:', error) });

sequelize
  .sync({ alter: true })
  .then(() => seedPermissions(sequelize))
  .catch(e => console.log(e))

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
