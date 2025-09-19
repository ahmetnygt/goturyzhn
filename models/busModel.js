const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("bus", {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    busModelId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    captainId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    licensePlate: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    owner: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });
};
