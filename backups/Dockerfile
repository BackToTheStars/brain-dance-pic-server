# Образ для сервиса бэкапов (LTS). mongodb-tools совместимы с mongo:7.0.
FROM node:22-alpine

# Устанавливаем необходимые пакеты
RUN apk update && \
    apk add --no-cache bash coreutils mongodb-tools curl tzdata tar

# Устанавливаем часовой пояс (если необходимо)
ENV TZ=Europe/Moscow

# Создаем директории для скриптов и бэкапов
RUN mkdir -p /scripts /backups /app

# Копируем скрипты и код приложения
COPY backups/scripts /scripts
COPY backups/package*.json /app/
COPY modules/core/models /app/modules/core/models
COPY modules/media/models /app/modules/media/models
COPY backups/scripts/*.js /app/scripts/

# Устанавливаем рабочую директорию
WORKDIR /app

# Устанавливаем зависимости
RUN npm install

# Команда запуска Node.js с cron заданиями
CMD ["node", "/app/scripts/scheduler.js"]
