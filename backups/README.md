```
docker-compose exec mongo-backup node /app/scripts/full_export.js
```

```
docker-compose exec mongo-backup node /app/scripts/full_restore.js /backups/full/full_backup_2024-09-28_17-21-18.tar.gz
```

```
docker-compose exec mongo-backup node /app/scripts/daily_export.js <date> <mediaType>
docker-compose exec mongo-backup node /app/scripts/daily_export.js 2024-09-21 images
```

```
docker-compose exec mongo-backup node /app/scripts/daily_import.js <date> <mediaType>
docker-compose exec mongo-backup node /app/scripts/daily_import.js /backups/daily/images/2024-09-21.tar.gz images
```

```
docker-compose exec mongo-backup node /app/scripts/range_export.js <startDate> <endDate> <mediaType1> [<mediaType2> ...]
docker-compose exec mongo-backup node /app/scripts/range_export.js 2024-09-20 2024-09-25 images
```

```
docker-compose exec mongo-backup node /app/scripts/range_import.js <startDate> <endDate> <mediaType1> [<mediaType2> ...]
docker-compose exec mongo-backup node /app/scripts/range_import.js 2024-09-20 2024-09-22 images
```