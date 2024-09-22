#!/bin/bash

# Параметры подключения к MongoDB
MONGO_HOST=${MONGO_HOST:-mongo}
MONGO_PORT=${MONGO_PORT:-27017}
MONGO_DB=${MONGO_DB:-media}

# Путь к архиву бэкапа (передается как аргумент)
BACKUP_ARCHIVE=$1

if [ -z "$BACKUP_ARCHIVE" ]; then
  echo "Usage: $0 /path/to/backup.tar.gz"
  exit 1
fi

# Распаковываем архив
tar -xzf $BACKUP_ARCHIVE -C /backups/restore_temp

# Восстанавливаем бэкап
mongorestore --host $MONGO_HOST --port $MONGO_PORT --db $MONGO_DB --drop /backups/restore_temp

# Удаляем временные файлы
rm -rf /backups/restore_temp

# Логируем операцию
node /app/scripts/log_operations.js "restore_backup" '{"backup_archive": "'$BACKUP_ARCHIVE'"}' '{"status": "success"}'