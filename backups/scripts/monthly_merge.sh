#!/bin/bash

# Дата прошлого месяца
LAST_MONTH=$(date -d "last month" +"%Y-%m")

# Список типов медиа
MEDIA_TYPES=("images" "videos" "audios")

for TYPE in "${MEDIA_TYPES[@]}"
do
  # Путь к бэкапам за прошлый месяц
  BACKUP_DIR="/backups/daily/$TYPE"
  MERGE_DIR="/backups/monthly/$TYPE"
  mkdir -p $MERGE_DIR

  # Создаем пустой файл для объединения
  MERGE_FILE="$MERGE_DIR/$LAST_MONTH.json"
  > $MERGE_FILE

  # Объединяем все файлы за прошлый месяц
  find $BACKUP_DIR -type f -name "*.json" -newermt "$LAST_MONTH-01" ! -newermt "$(date -d "$LAST_MONTH-01 +1 month" +"%Y-%m-%d")" -exec cat {} + >> $MERGE_FILE
done

# Логируем операцию
node /app/scripts/log_operations.js "monthly_merge" '{"month": "'$LAST_MONTH'"}' '{"status": "success"}'