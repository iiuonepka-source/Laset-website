# Terminal Ghost Admin

## Запуск

```powershell
npm install
npm start
```

Админка: `http://localhost:3000/admin.html`

Если задан `DATABASE_URL`, сервер использует PostgreSQL и сам создает таблицы `users`, `sessions`, `audit`.
Если `DATABASE_URL` не задан, включается локальный JSON fallback для проверки.

## Переменные окружения

```env
PORT=3000
DATABASE_URL=postgres://user:password@host:5432/database
PGSSL=require
ADMIN_KEYS=TG-AABB200E-0560DD06-F4DE20E8,TG-CA435724-2DEF3FAA-732459AC,TG-8F0EB53C-FC91CF7C-C697C43B,TG-95223267-B43F2D91-759AE6E7
```

`PGSSL=require` нужен не всегда. Включай его, если хостинг PostgreSQL требует SSL.

## Админ-ключи

Ключи также лежат в `admin-keys.txt`:

```text
TG-AABB200E-0560DD06-F4DE20E8
TG-CA435724-2DEF3FAA-732459AC
TG-8F0EB53C-FC91CF7C-C697C43B
TG-95223267-B43F2D91-759AE6E7
```

Для продакшена лучше задать `ADMIN_KEYS` в переменных окружения и не публиковать `admin-keys.txt`.

## Client API

Логин клиента:

```http
POST /api/client/login
Content-Type: application/json

{
  "login": "nickname",
  "key": "U-USER-ACCESS-KEY",
  "hardwareId": "device-id",
  "clientVersion": "1.0.0",
  "game": "Minecraft"
}
```

Heartbeat активной сессии:

```http
POST /api/client/heartbeat
Content-Type: application/json

{
  "sessionToken": "token-from-login",
  "status": "online",
  "game": "Minecraft"
}
```

Logout:

```http
POST /api/client/logout
Content-Type: application/json

{
  "sessionToken": "token-from-login"
}
```
