const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("branch", {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stopId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1,
    },
    isMainBranch: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 0,
    },
    mainBranchId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
  });
};
