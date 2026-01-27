# Laset API - PostgreSQL Edition

Обновленная версия API с PostgreSQL базой данных и улучшенной безопасностью.

## Улучшения

✅ **PostgreSQL** вместо JSON файла
✅ **bcrypt** для хеширования паролей (вместо SHA256)
✅ **Индексы** для быстрого поиска
✅ **Audit log** для отслеживания действий админов
✅ **Connection pooling** для производительности
✅ **Транзакции** для целостности данных

## Установка

### 1. Установка PostgreSQL

**Windows:**
```bash
# Скачайте с https://www.postgresql.org/download/windows/
# Или через Chocolatey:
choco install postgresql
```

**Linux:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

### 2. Создание базы данных

```bash
# Войдите в PostgreSQL
psql -U postgres

# Создайте базу данных
CREATE DATABASE laset;

# Выйдите
\q
```

### 3. Инициализация схемы

```bash
# Из папки website/api
psql -U postgres -d laset -f schema.sql
```

### 4. Установка зависимостей

```bash
cd website/api
npm install
```

### 5. Настройка окружения

```bash
# Скопируйте пример конфига
cp .env.example .env

# Отредактируйте .env и укажите свои данные
nano .env
```

Пример `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=laset
DB_USER=postgres
DB_PASSWORD=your_secure_password

PORT=3000
NODE_ENV=production
BCRYPT_ROUNDS=12
```

### 6. Миграция данных (опционально)

Если у вас есть старая база данных в `users.json`:

```bash
npm run migrate
```

⚠️ **Важно:** Старые пароли (SHA256) не могут быть конвертированы в bcrypt. Пользователям нужно будет сбросить пароли.

### 7. Запуск сервера

```bash
# Production
npm start

# Development (с автоперезагрузкой)
npm run dev
```

## API Endpoints

### Публичные

- `POST /api/register` - Регистрация
- `POST /api/login` - Вход
- `POST /api/verify` - Проверка UID (для клиента)
- `GET /api/next-uid` - Получить следующий UID

### Пользовательские

- `POST /api/user/update` - Обновить профиль
- `POST /api/reset-hwid` - Сбросить HWID

### Админские

- `POST /api/admin/users` - Список всех пользователей
- `POST /api/admin/set-role` - Изменить роль
- `POST /api/admin/ban` - Забанить/разбанить
- `POST /api/admin/delete` - Удалить пользователя

## Структура базы данных

### Таблица `users`
- `uid` - Уникальный ID (автоинкремент)
- `email` - Email (уникальный)
- `nickname` - Никнейм (уникальный, до 16 символов)
- `password_hash` - Хеш пароля (bcrypt)
- `role` - Роль (user/admin)
- `hwid` - Хеш HWID
- `banned` - Статус бана
- `created_at` - Дата создания
- `last_login` - Последний вход
- `sessions` - Количество сессий
- `play_time` - Время игры (секунды)

### Таблица `sessions`
- История сессий пользователей
- Отслеживание HWID, IP, User-Agent

### Таблица `audit_log`
- Логи действий админов
- Для безопасности и аудита

## Безопасность

### Хеширование паролей
- **bcrypt** с 12 раундами (настраивается)
- Защита от rainbow tables
- Автоматическая соль

### HWID Protection
- SHA256 хеш HWID
- Привязка к устройству
- Возможность сброса

### SQL Injection Protection
- Параметризованные запросы
- Prepared statements
- Валидация входных данных

## Производительность

### Connection Pooling
- Максимум 20 соединений
- Автоматическое переиспользование
- Таймауты для защиты

### Индексы
- Email, nickname, HWID
- Быстрый поиск O(log n)
- Оптимизация JOIN запросов

## Мониторинг

### Логи
```bash
# Просмотр логов PostgreSQL
tail -f /var/log/postgresql/postgresql-*.log

# Активные соединения
psql -U postgres -d laset -c "SELECT * FROM pg_stat_activity;"
```

### Статистика
```bash
# Размер базы данных
psql -U postgres -d laset -c "SELECT pg_size_pretty(pg_database_size('laset'));"

# Количество пользователей
psql -U postgres -d laset -c "SELECT COUNT(*) FROM users;"
```

## Бэкапы

### Создание бэкапа
```bash
pg_dump -U postgres laset > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Восстановление
```bash
psql -U postgres laset < backup_20250127_120000.sql
```

### Автоматические бэкапы (cron)
```bash
# Добавьте в crontab
0 2 * * * pg_dump -U postgres laset > /backups/laset_$(date +\%Y\%m\%d).sql
```

## Troubleshooting

### Ошибка подключения
```bash
# Проверьте статус PostgreSQL
sudo systemctl status postgresql

# Перезапустите
sudo systemctl restart postgresql
```

### Забыли пароль PostgreSQL
```bash
# Измените метод аутентификации в pg_hba.conf на trust
sudo nano /etc/postgresql/*/main/pg_hba.conf

# Перезапустите и смените пароль
sudo systemctl restart postgresql
psql -U postgres
ALTER USER postgres PASSWORD 'new_password';
```

### Очистка базы данных
```bash
psql -U postgres -d laset -c "TRUNCATE users, sessions, audit_log RESTART IDENTITY CASCADE;"
```

## Миграция обратно на JSON (если нужно)

```bash
# Экспорт в JSON
psql -U postgres -d laset -t -A -F"," -c "SELECT row_to_json(users) FROM users" > users_export.json
```

## Поддержка

Если возникли проблемы:
1. Проверьте логи сервера
2. Проверьте логи PostgreSQL
3. Убедитесь что .env настроен правильно
4. Проверьте что PostgreSQL запущен

## License

MIT
