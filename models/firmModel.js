const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("Firm", {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    dbName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active",
    },
    uetdsUsername: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    uetdsPassword: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isUetdsTestMode: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true
    },
    comissionRate: {
      type: DataTypes.DECIMAL,
      allowNull: false,
      defaultValue: 20
    }
  });
};
