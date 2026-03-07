# SpookyBuy - Deployment Guide

## 🚀 Quick Deploy to Railway

### 1. Подготовка проекта
```bash
# Установите зависимости локально (опционально)
npm install
```

### 2. Создайте проект на Railway

1. Зайдите на [railway.app](https://railway.app)
2. Нажмите "New Project"
3. Выберите "Deploy from GitHub repo" (или загрузите файлы)

### 3. Добавьте PostgreSQL базу данных

1. В вашем проекте нажмите "New"
2. Выберите "Database" → "Add PostgreSQL"
3. Railway автоматически создаст переменную `DATABASE_URL`

### 4. Настройте переменные окружения

В разделе "Variables" добавьте:

```
JWT_SECRET=ваш-секретный-ключ-измените-это-на-случайную-строку
NODE_ENV=production
```

`DATABASE_URL` уже будет создана автоматически при добавлении PostgreSQL.

### 5. Deploy

Railway автоматически:
- Установит зависимости из `package.json`
- Запустит `npm start`
- Создаст таблицы в базе данных
- Выдаст вам URL для доступа

### 6. Готово! 🎉

Ваш сайт будет доступен по адресу типа: `https://your-project.up.railway.app`

## 📁 Структура проекта

```
├── server.js              # Главный файл сервера
├── package.json           # Зависимости Node.js
├── database/
│   └── db.js             # Настройка базы данных
├── routes/
│   └── auth.js           # API роуты для авторизации
├── auth.html             # Страница входа/регистрации
├── auth.js               # Клиентский JS для авторизации
├── index.html            # Главная страница
├── purchase.html         # Страница покупки
├── soon.html             # Страница "скоро"
├── language-select.html  # Выбор языка
└── ... (остальные файлы)
```

## 🔐 Безопасность

- Пароли хешируются с помощью bcrypt
- JWT токены для авторизации
- Защищенное соединение с PostgreSQL
- CORS настроен правильно

## 🛠 Локальная разработка

```bash
# Установите зависимости
npm install

# Создайте файл .env
cp .env.example .env

# Отредактируйте .env и добавьте свои данные

# Запустите сервер
npm run dev
```

## 📝 API Endpoints

- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `GET /api/auth/verify` - Проверка токена

## 💡 Что дальше?

После деплоя вы можете:
- Добавить систему оплаты
- Интегрировать Discord бота
- Добавить админ панель
- Настроить email уведомления
