// ========== КЛАСИ (з ПЗ 1) ==========

class User {
  static _idCounter = 0;
  #password;
  #role;
  #warnings;
  #isMuted;
  #muteEnd;

  constructor(name, email, password) {
    this.id = ++User._idCounter;
    this.name = name;
    this.email = email;
    this.#password = password;
    this.#role = 'User';
    this.#warnings = 0;
    this.#isMuted = false;
    this.#muteEnd = null;
  }

  // Відновлення з даних localStorage (без зміни лічильника ззовні)
  static _restore(data) {
    const u = new User(data.name, data.email, data.password);
    // Перезаписуємо id збереженим значенням
    u.id = data.id;
    u._setRole(data.role);
    for (let i = 0; i < (data.warnings || 0); i++) u.addWarning();
    if (data.isMuted && data.muteEnd && data.muteEnd > Date.now()) {
      u.mute(data.muteEnd - Date.now());
    }
    // Гарантуємо що лічильник не менший за максимальний id
    if (data.id >= User._idCounter) User._idCounter = data.id;
    return u;
  }

  // Серіалізація для збереження у localStorage
  _serialize() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      password: this.#password,
      role: this.#role,
      warnings: this.#warnings,
      isMuted: this.#isMuted,
      muteEnd: this.#muteEnd,
    };
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.#role,
      warnings: this.#warnings,
      isMuted: this.isMuted(),
    };
  }

  checkPassword(input) { return this.#password === input; }
  getRole() { return this.#role; }
  _setRole(r) { this.#role = r; }
  _setPassword(p) { this.#password = p; }
  addWarning() { return ++this.#warnings; }

  isMuted() {
    if (this.#isMuted && this.#muteEnd && Date.now() > this.#muteEnd) {
      this.#isMuted = false;
      this.#muteEnd = null;
    }
    return this.#isMuted;
  }

  mute(ms) {
    this.#isMuted = true;
    this.#muteEnd = Date.now() + ms;
  }
}

// ========== ADMIN ==========

class Admin extends User {
  constructor(name, email, password) {
    super(name, email, password);
    this._setRole('Admin');
  }

  deleteUser(user, db) {
    if (user.getRole() === 'SuperAdmin')
      return { ok: false, msg: 'Не можна видалити SuperAdmin!' };
    if (user.getRole() === 'Admin' && this.getRole() !== 'SuperAdmin')
      return { ok: false, msg: 'Тільки SuperAdmin видаляє адмінів!' };
    return db.DeleteUser(user.id);
  }

  resetPassword(user, newPass) {
    if (user.getRole() === 'SuperAdmin')
      return { ok: false, msg: 'Не можна змінити пароль SuperAdmin!' };
    user._setPassword(newPass);
    return { ok: true, msg: `Пароль "${user.name}" змінено.` };
  }
}

// ========== MODERATOR ==========

class Moderator extends User {
  constructor(name, email, password) {
    super(name, email, password);
    this._setRole('Moderator');
  }

  warnUser(user) {
    if (user.getRole() !== 'User')
      return { ok: false, msg: `Не можна попередити ${user.getRole()}!` };
    const c = user.addWarning();
    return { ok: true, msg: `"${user.name}" отримав попередження (${c}).` };
  }

  muteUser(user, sec) {
    if (user.getRole() !== 'User')
      return { ok: false, msg: `Не можна замутити ${user.getRole()}!` };
    user.mute(sec * 1000);
    return { ok: true, msg: `"${user.name}" замучений на ${sec} сек.` };
  }
}

// ========== SUPER ADMIN ==========

class SuperAdmin extends Admin {
  constructor(name, email, password) {
    super(name, email, password);
    this._setRole('SuperAdmin');
  }

  createAdmin(name, email, password) {
    return new Admin(name, email, password);
  }

  deleteAdmin(admin, db) {
    if (admin.getRole() !== 'Admin')
      return { ok: false, msg: 'Це не адмін!' };
    return this.deleteUser(admin, db);
  }
}

// ========================================================
// ========== SINGLETON: UserDataBase ==========
// ========================================================
// Гарантує існування лише одного екземпляра бази користувачів.
// Зберігає дані у localStorage (файлова система браузера).
// При ініціалізації завантажує раніше збережених користувачів.

class UserDataBase {
  // Єдиний екземпляр (Singleton)
  static #instance = null;

  #users;
  #storageKey;

  constructor() {
    // --- Singleton guard ---
    if (UserDataBase.#instance) {
      return UserDataBase.#instance;
    }

    this.#storageKey = 'userDataBase';
    this.#users = [];

    // Завантаження з файлової системи (localStorage)
    this.#load();

    UserDataBase.#instance = this;
  }

  // Публічний статичний метод доступу до Singleton
  static getInstance() {
    if (!UserDataBase.#instance) {
      new UserDataBase();
    }
    return UserDataBase.#instance;
  }

  // ---------- Публічний API ----------

  /**
   * CreateUser — створює нового користувача та зберігає в БД.
   * @param {string} name
   * @param {string} email
   * @param {string} password
   * @param {string} role — 'User' | 'Moderator' | 'Admin' | 'SuperAdmin'
   * @returns {User} створений об'єкт
   */
  CreateUser(name, email, password, role = 'User') {
    let user;
    switch (role) {
      case 'SuperAdmin': user = new SuperAdmin(name, email, password); break;
      case 'Admin':      user = new Admin(name, email, password);      break;
      case 'Moderator':  user = new Moderator(name, email, password);  break;
      default:           user = new User(name, email, password);
    }
    this.#users.push(user);
    this.#save();
    return user;
  }

  /**
   * DeleteUser — видаляє користувача за id.
   * @param {number} id
   * @returns {{ ok: boolean, msg: string }}
   */
  DeleteUser(id) {
    const idx = this.#users.findIndex(u => u.id === id);
    if (idx === -1) return { ok: false, msg: 'Користувача не знайдено.' };
    const removed = this.#users.splice(idx, 1)[0];
    this.#save();
    return { ok: true, msg: `"${removed.name}" видалено.` };
  }

  /**
   * DeleteAllUsers — видаляє всіх користувачів, що відповідають критеріям.
   * Критерії — об'єкт з полями: { role, name, email }.
   * Поля порівнюються часткою (includes, case-insensitive).
   * SuperAdmin ніколи не видаляється масово.
   * @param {object} criteria — { role?, name?, email? }
   * @returns {{ ok: boolean, msg: string, count: number }}
   */
  DeleteAllUsers(criteria = {}) {
    const before = this.#users.length;
    this.#users = this.#users.filter(u => {
      // SuperAdmin захищений від масового видалення
      if (u.getRole() === 'SuperAdmin') return true;
      return !this.#matchCriteria(u, criteria);
    });
    const count = before - this.#users.length;
    this.#save();
    return count > 0
      ? { ok: true, msg: `Видалено ${count} користувач(ів).`, count }
      : { ok: false, msg: 'Нікого не знайдено за критеріями.', count: 0 };
  }

  /**
   * SearchUser — шукає користувачів за критеріями.
   * @param {object} criteria — { id?, role?, name?, email? }
   * @returns {User[]} масив знайдених користувачів
   */
  SearchUser(criteria = {}) {
    return this.#users.filter(u => this.#matchCriteria(u, criteria));
  }

  // ---------- Допоміжні методи ----------

  // Додати вже створений об'єкт (для внутрішнього використання)
  addUser(user) {
    this.#users.push(user);
    this.#save();
  }

  findById(id) {
    return this.#users.find(u => u.id === id) || null;
  }

  getAll() {
    return this.#users.map(u => u.getInfo());
  }

  get users() {
    return [...this.#users];
  }

  // Зберегти поточний стан у localStorage
  save() {
    this.#save();
  }

  // ---------- Приватні методи ----------

  #matchCriteria(user, criteria) {
    const info = user.getInfo();
    if (criteria.id !== undefined && info.id !== criteria.id) return false;
    if (criteria.role && info.role !== criteria.role) return false;
    if (criteria.name && !info.name.toLowerCase().includes(criteria.name.toLowerCase())) return false;
    if (criteria.email && !info.email.toLowerCase().includes(criteria.email.toLowerCase())) return false;
    return true;
  }

  #save() {
    const data = this.#users.map(u => u._serialize());
    localStorage.setItem(this.#storageKey, JSON.stringify(data));
  }

  #load() {
    const raw = localStorage.getItem(this.#storageKey);
    if (!raw) return;
    try {
      const arr = JSON.parse(raw);
      this.#users = arr.map(d => {
        const user = User._restore(d);
        // Відновлюємо правильний прототип згідно ролі
        switch (d.role) {
          case 'SuperAdmin': Object.setPrototypeOf(user, SuperAdmin.prototype); break;
          case 'Admin':      Object.setPrototypeOf(user, Admin.prototype);      break;
          case 'Moderator':  Object.setPrototypeOf(user, Moderator.prototype);  break;
        }
        return user;
      });
    } catch (e) {
      console.warn('Помилка завантаження UserDataBase з localStorage:', e);
      this.#users = [];
    }
  }
}

// ========== ІНІЦІАЛІЗАЦІЯ ==========

// Отримуємо Singleton-екземпляр (завантажує з localStorage якщо є дані)
const db = UserDataBase.getInstance();

// Перевірка: той самий об'єкт
console.log('Singleton перевірка:', db === UserDataBase.getInstance()); // true
console.log('Singleton перевірка:', db === new UserDataBase());         // true

// Якщо БД порожня — заповнюємо початковими даними
if (db.getAll().length === 0) {
  db.CreateUser('Головний Адмін', 'superadmin@test.ua', 'super123', 'SuperAdmin');
  db.CreateUser('Олена', 'olena@test.ua', 'mod123', 'Moderator');
  db.CreateUser('Іван', 'ivan@test.ua', 'ivan123', 'User');
  db.CreateUser('Марія', 'maria@test.ua', 'maria123', 'User');
}

// Поточний актор — перший SuperAdmin
let actor = db.SearchUser({ role: 'SuperAdmin' })[0] || db.users[0];

const logs = [];
function log(msg) {
  const t = new Date().toLocaleTimeString('uk-UA');
  logs.unshift(`<span>[${t}]</span> ${msg}`);
  if (logs.length > 30) logs.pop();
}
log('Система запущена. Дані завантажено з localStorage.');

// ========== РЕНДЕР ==========

function render() {
  const tbody = document.getElementById('users-table');
  const users = db.getAll();

  tbody.innerHTML = users.map(u => {
    let btns = '';
    if (u.id !== actor.id) {
      const ar = actor.getRole();
      if ((ar === 'SuperAdmin' || ar === 'Admin') && u.role !== 'SuperAdmin') {
        btns += `<button class="btn-del" onclick="del(${u.id})">Видалити</button>`;
        btns += `<button class="btn-reset" onclick="resetPw(${u.id})">Пароль</button>`;
      }
      if (['SuperAdmin','Admin','Moderator'].includes(ar) && u.role === 'User') {
        btns += `<button class="btn-warn" onclick="warn(${u.id})">Попередити</button>`;
        btns += `<button class="btn-mute" onclick="mute(${u.id})">Мут</button>`;
      }
    }
    return `<tr class="${u.isMuted ? 'muted' : ''}">
      <td>${u.id}</td>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td><span class="role role-${u.role}">${u.role}</span></td>
      <td>${u.warnings || ''}</td>
      <td>${btns}</td>
    </tr>`;
  }).join('');

  // Селектор актора
  const sel = document.getElementById('actor-select');
  sel.innerHTML = db.users.map(u =>
    `<option value="${u.id}" ${u.id === actor.id ? 'selected' : ''}>${u.name} (${u.getRole()})</option>`
  ).join('');
  document.getElementById('actor-role').textContent = actor.getRole();

  // Лог
  document.getElementById('log').innerHTML = logs.map(l => `<div>${l}</div>`).join('');
}

function switchActor() {
  const u = db.findById(+document.getElementById('actor-select').value);
  if (u) { actor = u; log(`Переключено на: ${u.name}`); render(); }
}

// ========== ДІЇ ==========

function del(id) {
  const t = db.findById(id);
  if (!t || !confirm(`Видалити "${t.name}"?`)) return;
  const r = (actor instanceof Admin) ? actor.deleteUser(t, db) : { ok: false, msg: 'Немає прав!' };
  log(r.msg);
  render();
}

function resetPw(id) {
  const t = db.findById(id);
  if (!t) return;
  const p = prompt(`Новий пароль для "${t.name}":`);
  if (!p) return;
  const r = (actor instanceof Admin) ? actor.resetPassword(t, p) : { ok: false, msg: 'Немає прав!' };
  if (r.ok) db.save(); // зберегти зміну пароля
  log(r.msg);
  render();
}

function warn(id) {
  const t = db.findById(id);
  if (!t) return;
  let r;
  if (actor instanceof Moderator) r = actor.warnUser(t);
  else if (actor instanceof Admin) {
    if (t.getRole() !== 'User') r = { ok: false, msg: 'Не можна!' };
    else { const c = t.addWarning(); r = { ok: true, msg: `"${t.name}" попередження (${c}).` }; }
  } else r = { ok: false, msg: 'Немає прав!' };
  if (r.ok) db.save();
  log(r.msg);
  render();
}

function mute(id) {
  const t = db.findById(id);
  if (!t) return;
  const s = parseInt(prompt('Секунд:', '30'));
  if (!s || s <= 0) return;
  let r;
  if (actor instanceof Moderator) r = actor.muteUser(t, s);
  else if (actor instanceof Admin) {
    if (t.getRole() !== 'User') r = { ok: false, msg: 'Не можна!' };
    else { t.mute(s * 1000); r = { ok: true, msg: `"${t.name}" замучений на ${s} сек.` }; }
  } else r = { ok: false, msg: 'Немає прав!' };
  if (r.ok) db.save();
  log(r.msg);
  render();
}

function addUser() {
  const name = document.getElementById('new-name').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const pass = document.getElementById('new-pass').value.trim();
  const role = document.getElementById('new-role').value;
  if (!name || !email || !pass) return alert('Заповніть всі поля!');

  // Створення через API UserDataBase
  if (role === 'Admin' && !(actor instanceof SuperAdmin)) {
    return alert('Тільки SuperAdmin може створювати адмінів!');
  }
  const u = db.CreateUser(name, email, pass, role);
  log(`Додано: ${u.name} (${u.getRole()})`);
  document.getElementById('new-name').value = '';
  document.getElementById('new-email').value = '';
  document.getElementById('new-pass').value = '';
  render();
}

function deleteAllByRole() {
  const role = document.getElementById('del-role').value;
  if (!confirm(`Видалити ВСІХ з роллю "${role}"?`)) return;
  const r = db.DeleteAllUsers({ role });
  log(r.msg);
  render();
}

function searchUsers() {
  const q = document.getElementById('search-query').value.trim().toLowerCase();
  if (!q) return;

  // Шукаємо по імені, email та ролі одночасно
  const byName = db.SearchUser({ name: q });
  const byEmail = db.SearchUser({ email: q });
  const byRole = db.SearchUser({ role: q.charAt(0).toUpperCase() + q.slice(1) });

  // Об'єднуємо без дублікатів
  const map = new Map();
  [...byName, ...byEmail, ...byRole].forEach(u => map.set(u.id, u));
  const results = [...map.values()];

  const table = document.getElementById('search-results-table');
  const tbody = document.getElementById('search-results');
  if (results.length === 0) {
    table.style.display = 'none';
    log(`Пошук «${q}» — нічого не знайдено.`);
  } else {
    table.style.display = '';
    tbody.innerHTML = results.map(u => {
      const info = u.getInfo();
      return `<tr>
        <td>${info.id}</td>
        <td>${info.name}</td>
        <td>${info.email}</td>
        <td><span class="role role-${info.role}">${info.role}</span></td>
      </tr>`;
    }).join('');
    log(`Пошук «${q}» — знайдено ${results.length}.`);
  }
  render();
}

function clearSearch() {
  document.getElementById('search-query').value = '';
  document.getElementById('search-results-table').style.display = 'none';
  document.getElementById('search-results').innerHTML = '';
}

function checkPass() {
  const id = +document.getElementById('chk-id').value;
  const pw = document.getElementById('chk-pass').value;
  const u = db.findById(id);
  if (!u) return alert('Не знайдено!');
  const ok = u.checkPassword(pw);
  log(ok ? `Пароль "${u.name}" — вірний ✅` : `Пароль "${u.name}" — невірний ❌`);
  render();
}

// Автооновлення мутів + збереження
setInterval(() => { db.save(); render(); }, 5000);
document.addEventListener('DOMContentLoaded', render);
