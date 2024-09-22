#!/bin/bash

# Параметры подключения к MongoDB
MONGO_HOST=${MONGO_HOST:-mongo}
MONGO_PORT=${MONGO_PORT:-27017}
MONGO_DB=${MONGO_DB:-media}

# Дата вчерашнего дня
YESTERDAY=$(date -d "yesterday" +"%F")

# Список типов медиа
MEDIA_TYPES=("images" "videos" "audios")

for TYPE in "${MEDIA_TYPES[@]}"
do
  # Путь для сохранения бэкапа
  BACKUP_PATH="/backups/daily/$TYPE/$YESTERDAY"
  mkdir -p $BACKUP_PATH

  # Экспорт данных за вчерашний день
  mongoexport --host $MONGO_HOST --port $MONGO_PORT --db $MONGO_DB --collection $TYPE --query '{"createdAt": {"$gte": {"$date": "'$YESTERDAY'T00:00:00Z"}, "$lt": {"$date": "'$YESTERDAY'T23:59:59Z"}}}' --out $BACKUP_PATH/$TYPE.json
done

# Логируем операцию
node /app/scripts/log_operations.js "daily_backup" "{\"date\": \"$YESTERDAY\"}" '{"status": "success"}'