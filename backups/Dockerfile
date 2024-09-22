# Используем образ Node.js с установленным bash и cron
FROM node:18-alpine

# Устанавливаем необходимые пакеты
RUN apk update && \
    apk add --no-cache bash coreutils mongodb-tools curl tzdata

# Устанавливаем часовой пояс (если необходимо)
ENV TZ=Europe/Moscow

# Создаем директории для скриптов и бэкапов
RUN mkdir -p /scripts /backups /app

# Копируем скрипты в контейнер
COPY backups/scripts /scripts

# Даём права на выполнение скриптов
RUN chmod +x /scripts/*.sh

# Копируем файл crontab
COPY backups/crontab /etc/crontabs/root

# Устанавливаем рабочую директорию
WORKDIR /app

# Устанавливаем зависимости (если нужны для скриптов Node.js)
COPY backups/package*.json /app/

RUN npm install

# Копируем остальной код (если требуется)
COPY modules/core/models /app/modules/core/models
COPY modules/media/models /app/modules/media/models

COPY backups/scripts/*.js /app/scripts/

# Команда запуска cron
CMD ["crond", "-f", "-l", "2"]