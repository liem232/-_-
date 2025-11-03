
Проект: Система разделения ролей (русский)

Файлы:
- server.js  — основной сервер Express (регистрация, вход, сессии, проверка ролей)
- models.js  — Sequelize модели: Role, Position, User
- package.json

Запуск:
1. распакуйте проект
2. npm install
3. node server.js   (по умолчанию использует SQLite ./database.sqlite)
   либо в режиме без БД: NO_DB=1 node server.js

Примеры:
- начальный админ: login=admin, pass=admin (создаётся при первом старте, если нет)
- Маршруты: /, /register, /login, /profile, /admin, /logout
