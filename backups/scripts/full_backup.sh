#!/bin/bash

# Параметры подключения к MongoDB
MONGO_HOST=${MONGO_HOST:-mongo}
MONGO_PORT=${MONGO_PORT:-27017}
MONGO_DB=${MONGO_DB:-media}

# Дата и время
TIMESTAMP=$(date +"%F_%H-%M-%S")

# Путь для сохранения бэкапа
BACKUP_PATH="/backups/full/$TIMESTAMP"

# Создаем директорию
mkdir -p $BACKUP_PATH

# Выполняем полное резервное копирование
mongodump --host $MONGO_HOST --port $MONGO_PORT --db $MONGO_DB --out $BACKUP_PATH

# Архивируем бэкап
tar -czf /backups/full_backup_$TIMESTAMP.tar.gz -C /backups/full $TIMESTAMP

# Удаляем неархивированные файлы
rm -rf $BACKUP_PATH

# Логируем операцию
node /app/scripts/log_operations.js "full_backup" '{"timestamp": "'$TIMESTAMP'"}' '{"status": "success"}'