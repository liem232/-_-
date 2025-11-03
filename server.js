
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { sequelize, Role, Position, User } = require('./models');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

const NO_DB = process.env.NO_DB === '1' || process.env.NO_DB === 'true';

// Временные данные для режима без БД
let memoryUsers = [
  { id: 1, login: 'admin', password: 'admin', role: 'Администратор' },
  { id: 2, login: 'user', password: 'user', role: 'Пользователь' }
];

async function initDb(){
  try {
    await sequelize.sync();
    // создаём роли, если их нет
    const roles = ['Администратор','Пользователь'];
    for (const r of roles){
      await Role.findOrCreate({ where: { name: r } });
    }
    // пример: seed admin
    const adminRole = await Role.findOne({ where: { name: 'Администратор' } });
    const existing = await User.findOne({ where: { login: 'admin' } });
    if (!existing){
      const hash = await bcrypt.hash('admin', 10);
      await User.create({ login: 'admin', passwordHash: hash, name: 'Админ', roleId: adminRole.id });
      console.log('Создан пользователь admin/admin с ролью Администратор');
    }
    console.log('Инициализация БД завершена.');
  } catch(err){
    console.error('Ошибка инициализации БД:', err);
  }
}

let sessionStore;
if (!NO_DB){
  initDb();
  sessionStore = new SequelizeStore({ db: sequelize });
  sessionStore.sync();
}

app.use(session({
  secret: 'change-me-secret',
  resave: false,
  saveUninitialized: false,
  store: NO_DB ? undefined : sessionStore,
  cookie: { maxAge: 24*60*60*1000 }
}));

function page(title, body){
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>
  <h1>${title}</h1>
  ${body}
  <p><a href="/">Главная</a> | <a href="/register">Регистрация</a> | <a href="/login">Вход</a> | <a href="/profile">Профиль</a> | <a href="/admin">Админ</a> | <a href="/logout">Выход</a></p>
  </body></html>`;
}

// Middleware: проверка авторизации
function isAuthenticated(req,res,next){
  if (req.session.user) return next();
  return res.redirect('/login');
}

// Middleware: проверка роли
function hasRole(roleName){
  return async function(req,res,next){
    if (!req.session.user) return res.redirect('/login');
    if (NO_DB){
      const u = memoryUsers.find(x=>x.id===req.session.user.id);
      if (u && u.role === roleName) return next();
      return res.status(403).send('Доступ запрещён: недостаточно прав');
    } else {
      try {
        const user = await User.findByPk(req.session.user.id, { include: Role });
        if (user && user.Role && user.Role.name === roleName) return next();
        return res.status(403).send('Доступ запрещён: недостаточно прав');
      } catch(err){
        console.error('Ошибка проверки роли:', err);
        return res.status(500).send('Внутренняя ошибка сервера');
      }
    }
  };
}

// Маршруты
app.get('/', (req,res)=>{
  res.send(page('Главная', `<p>${req.session.user ? 'Вы вошли как: '+req.session.user.login+' (роль: '+req.session.user.role+')' : 'Вы не авторизованы.'}</p>`));
});

// Регистрация
app.get('/register', async (req,res)=>{
  let options = '';
  if (NO_DB){
    options = `<option value="Пользователь">Пользователь</option><option value="Администратор">Администратор</option>`;
  } else {
    const roles = await Role.findAll();
    options = roles.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
  }
  const form = `
  <form method="post" action="/register">
    <label>Логин: <input name="login" required></label><br>
    <label>Пароль: <input type="password" name="password" required></label><br>
    <label>Роль: <select name="role">${options}</select></label><br>
    <button type="submit">Зарегистрироваться</button>
  </form>`;
  res.send(page('Регистрация', form));
});

app.post('/register', async (req,res)=>{
  const { login, password, role } = req.body;
  if (NO_DB){
    const id = memoryUsers.length ? Math.max(...memoryUsers.map(u=>u.id))+1 : 1;
    memoryUsers.push({ id, login, password, role });
    console.log('Зарегистрирован (NO_DB):', login, 'роль:', role);
    return res.redirect('/login');
  } else {
    const roleInstance = await Role.findByPk(role);
    if (!roleInstance) return res.status(400).send('Роль не найдена');
    const hash = await bcrypt.hash(password, 10);
    try {
      await User.create({ login, passwordHash: hash, roleId: roleInstance.id });
      console.log('Зарегистрирован пользователь:', login, 'роль:', roleInstance.name);
      return res.redirect('/login');
    } catch(err){
      console.error('Ошибка при регистрации:', err);
      return res.status(400).send('Ошибка при создании пользователя: '+err.message);
    }
  }
});

// Вход
app.get('/login', (req,res)=>{
  const form = `
  <form method="post" action="/login">
    <label>Логин: <input name="login" required></label><br>
    <label>Пароль: <input type="password" name="password" required></label><br>
    <button type="submit">Войти</button>
  </form>`;
  res.send(page('Вход', form));
});

app.post('/login', async (req,res)=>{
  const { login, password } = req.body;
  if (NO_DB){
    const user = memoryUsers.find(u=>u.login===login && u.password===password);
    if (user){
      req.session.user = { id: user.id, login: user.login, role: user.role };
      console.log('Вход (NO_DB):', user.login);
      return res.redirect('/profile');
    } else {
      return res.status(401).send('Неверный логин или пароль');
    }
  } else {
    try {
      const user = await User.findOne({ where: { login }, include: Role });
      if (!user) return res.status(401).send('Неверный логин или пароль');
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).send('Неверный логин или пароль');
      req.session.user = { id: user.id, login: user.login, role: user.Role ? user.Role.name : null };
      console.log('Вход:', user.login, 'роль:', req.session.user.role);
      return res.redirect('/profile');
    } catch(err){
      console.error('Ошибка при входе:', err);
      return res.status(500).send('Ошибка сервера');
    }
  }
});

app.get('/profile', isAuthenticated, async (req,res)=>{
  let info = '';
  if (NO_DB){
    const u = memoryUsers.find(x=>x.id===req.session.user.id);
    info = `<p>Логин: ${u.login}<br>Роль: ${u.role}</p>`;
  } else {
    const user = await User.findByPk(req.session.user.id, { include: Role });
    info = `<p>Логин: ${user.login}<br>Роль: ${user.Role ? user.Role.name : 'N/A'}</p>`;
  }
  res.send(page('Профиль', info));
});

app.get('/admin', isAuthenticated, hasRole('Администратор'), (req,res)=>{
  res.send(page('Админ-панель', '<p>Добро пожаловать в админ-панель! Только для администраторов.</p>'));
});

app.get('/logout', (req,res)=>{
  req.session.destroy(()=>{ res.redirect('/'); });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Сервер запущен на порту', PORT));
