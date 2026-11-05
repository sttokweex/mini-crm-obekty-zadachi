# Публикация на Vercel

В репозитории уже есть `vercel.json`: Vercel установит зависимости через `npm ci`, соберёт Vite и опубликует `dist`. Сборка остановится с понятной ошибкой, если не указаны переменные Supabase.

## 1. Подготовить Supabase

1. Создать проект Supabase и дождаться запуска базы.
2. В **Authentication → Providers → Email** выключить **Allow new users to sign up**.
3. В **SQL Editor** выполнить [`supabase/migrations/202611060001_init.sql`](supabase/migrations/202611060001_init.sql).
4. В **Authentication → Users** создать вручную трёх подтверждённых пользователей. Записать их email и пароли для сдачи задания. Пароли не добавлять в Git и Vercel.
5. В [`supabase/seed_demo.sql`](supabase/seed_demo.sql) заменить три email на созданные и выполнить скрипт в SQL Editor один раз. Он создаст роли, объекты и задачи.
6. В **Project Settings → API** скопировать **Project URL** и **publishable key** (или legacy `anon` key). `service_role`/secret key не использовать.

## 2. Опубликовать GitHub репозиторий

Из корня этого проекта:

```bash
gh auth login -h github.com
gh repo create mini-crm-obekty-zadachi --public --source=. --remote=origin --push
```

Если репозиторий уже создан на GitHub, добавьте его как `origin` и выполните `git push -u origin main`. В коммитах нет `.env.local` и паролей. Для приватного репозитория замените `--public` на `--private` и выдайте проверяющим доступ.

## 3. Импортировать в Vercel

1. На Vercel выбрать **Add New → Project**, импортировать GitHub репозиторий.
2. Проверить **Framework Preset: Vite** и **Root Directory: `./`**. Build/Install/Output уже заданы в `vercel.json`.
3. В **Environment Variables** добавить:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL из Supabase |
   | `VITE_SUPABASE_ANON_KEY` | publishable/anon key из Supabase |

   Выберите **Production**; если нужны preview deployments, добавьте эти же переменные для **Preview**. Переменные `VITE_` попадают в браузер, поэтому сюда допустим только публичный ключ.
4. Нажать **Deploy**. Для последующих изменений достаточно `git push`: Vercel пересоберёт проект автоматически.

Можно развернуть и без GitHub через Vercel CLI (`npx vercel` / `npx vercel --prod`), но GitHub нужен для сдачи задания.

## 4. Быстрая проверка после публикации

- Открыть ссылку Vercel: должна появиться форма входа, а не экран настройки.
- Войти под постановщиком: видны 3 объекта, 5 задач, создание/редактирование/удаление и действия проверки.
- Войти под каждым исполнителем: видны только назначенные ему задачи и связанные объекты; доступны только разрешённые переходы.
- Вернуть задачу на доработку: без комментария действие не проходит; с комментарием появляется запись в истории.
- Скопировать URL приложения и GitHub репозитория в шаблон [`HANDOFF.md`](HANDOFF.md).

Вход по email и паролю не требует настройки redirect URL. Если позже добавится вход по ссылке из письма или OAuth, его придётся настроить отдельно в Supabase Auth.
