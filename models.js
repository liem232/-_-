const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize({ dialect: 'sqlite', storage: './database.sqlite', logging: false });

const Role = sequelize.define('Role', {
  name: { type: DataTypes.STRING, unique: true, allowNull: false }
});

const Position = sequelize.define('Position', {
  title: { type: DataTypes.STRING, allowNull: false }
});

const User = sequelize.define('User', {
  login: { type: DataTypes.STRING, unique: true, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING }
});

// Связи
Role.hasMany(User, { foreignKey: 'roleId', onDelete: 'CASCADE' });
User.belongsTo(Role, { foreignKey: 'roleId' });

Position.hasMany(User, { foreignKey: 'positionId' });
User.belongsTo(Position, { foreignKey: 'positionId' });

module.exports = { sequelize, Role, Position, User };
