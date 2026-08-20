# brain-dance-pic-server

Сервис хранит изображения, аудио, видео и pdf в MongoDB GridFS.

## Пересборка образа: yt-dlp и ffmpeg

В образе стоят `yt-dlp` и `ffmpeg` (перенос видео с YouTube, `POST /youtube/probe` и
`POST /youtube/download`). Версия зафиксирована в `Dockerfile` — `ARG YTDLP_VERSION`
и `ARG YTDLP_SHA256`.

**Образ нужно периодически пересобирать с новой версией.** YouTube регулярно ломает
извлечение, и зафиксированный yt-dlp в какой-то момент просто перестаёт скачивать —
починка выглядит как обновление этих двух `ARG`:

```
YTDLP_VERSION — тег релиза https://github.com/yt-dlp/yt-dlp/releases
YTDLP_SHA256  — строка для файла `yt-dlp` из SHA2-256SUMS того же релиза
```

Сборка сама проверит контрольную сумму и выполнит `yt-dlp --version`, поэтому
неверная пара версия/сумма роняет билд, а не прод.

`ffmpeg` нужен для склейки. Progressive-форматов, где видео и звук лежат в одном
файле, у YouTube больше нет, поэтому дорожки качаются по отдельности и склеиваются
в mp4; контейнеры совместимы, так что это remux (`-c copy`), без перекодирования.
Версия ffmpeg не пинуется — берётся из репозитория Alpine.

Для локальной отладки (`npm run dev:media` идёт на хосте, а не в контейнере) нужны
`yt-dlp` и `ffmpeg` на PATH машины; путь к yt-dlp можно задать переменной
`YTDLP_BIN`. Без ffmpeg скачивание пары дорожек не выполнится — probe при этом
работает как обычно.

## Токен для защищённых ручек

Токен требуют `upload`, `download-and-save`, `/stats`, `/youtube/*` и — с волны 6 —
`DELETE /<тип>/:id`. Отдача (`GET /<тип>/:filename`) намеренно открыта: файл читает
браузер по прямой ссылке.

В токене лежит операция, и middleware сверяет её с ручкой: без заголовка — 401, с битым
токеном — 403, с токеном чужой операции — 400 `Invalid operation`. Операции:
`upload`, `download_and_save`, `delete`, `stats`, `youtube`.

`npm run token` в этом репозитории нерабочий (`scripts/tokens.js` нет), поэтому токен
подписывается однострочником — из каталога `media`, операция подставляется вторым
аргументом (здесь `delete`, срок жизни 5 минут):

```
node -e "require('dotenv').config();const {getToken}=require('./modules/auth/lib/token');console.log(getToken(process.env.JWT_SECRET_STATIC,'delete',Date.now()+300000,'test'))"
```

Дальше — обычным curl:

```
curl -X DELETE -H "Authorization: Bearer <токен>" http://localhost:3011/images/<id>
```

## Осиротевшие файлы: `scripts/orphans.js`

Сирота — файл в GridFS, на который нет записи `Media`: через API он недоступен (и отдача,
и удаление сначала ищут запись и отвечают 404), но место занимает и виден в `byType`
из `/stats`. Скрипт ходит в ту же базу, что и сервис (`MONGO_URL` из `.env`).

```
node scripts/orphans.js                       отчёт по всем типам, ничего не меняет
node scripts/orphans.js --type=images         отчёт по одному типу
node scripts/orphans.js --delete --all        снести всех найденных сирот
node scripts/orphans.js --delete --type=videos
node scripts/orphans.js --delete --id=<id>    снести конкретные файлы
```

Без `--delete` скрипт только показывает. Голый `--delete` без цели (`--all`, `--type`
или `--id`) — ошибка, чтобы «снеси, что найдёшь» нельзя было запустить случайно.
Одноимённые версии, у которых запись `Media` есть, показываются отдельной строкой и
не удаляются: какая из них лишняя — отдельный вопрос (BP-13).

В контейнере — `docker compose exec media-app node scripts/orphans.js`.
