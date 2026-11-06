# Публикация на GitHub Pages

GitHub Pages подходит для этой CRM: интерфейс собирается в статические файлы, а вход и данные работают через Supabase. Сервер для React не нужен. Конфигурация Vite использует относительные пути к файлам, поэтому один и тот же проект работает и на `username.github.io/repo/`, и на Vercel.

## Подготовка

1. Настройте Supabase по шагам 1–6 в [`DEPLOY_VERCEL.md`](DEPLOY_VERCEL.md#1-подготовить-supabase). Нужны **Project URL** и **publishable/anon key**. Секретный ключ не используйте.
2. Опубликуйте этот репозиторий на GitHub. Для бесплатного GitHub Pages проще сделать его публичным:

   ```bash
   gh auth login -h github.com
   gh repo create mini-crm-obekty-zadachi --public --source=. --remote=origin --push
   ```

3. В репозитории откройте **Settings → Secrets and variables → Actions → Variables → New repository variable**. Добавьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`. Это публичные значения, которые окажутся в браузере; пароль пользователя и `service_role` туда добавлять нельзя.
4. Откройте **Settings → Pages → Build and deployment** и выберите **Source: GitHub Actions**.
5. Откройте **Actions → Deploy GitHub Pages → Run workflow**. Если workflow уже запускался после первого push и завершился ошибкой из-за отсутствовавших переменных, просто запустите его повторно.

После успешного деплоя ссылка появится в **Settings → Pages** и в результате workflow. Обычно она выглядит как `https://USERNAME.github.io/mini-crm-obekty-zadachi/`. Далее каждый push в `main` обновляет сайт автоматически.

Маршруты приложения используют `#` (например, `/#task/…`), поэтому обновление страницы на GitHub Pages работает без правил перенаправления. После публикации проверьте вход под тремя пользователями и видимость задач каждого исполнителя.
