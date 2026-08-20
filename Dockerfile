FROM node:22-alpine

WORKDIR /app

# yt-dlp для переноса видео с YouTube. Официальная сборка — python-zipapp,
# поэтому нужен только интерпретатор. Рядом ставится ffmpeg: progressive-
# форматов у YouTube больше нет, видео и звук качаются отдельными дорожками и
# склеиваются (BP-4, решение 2). При совместимых контейнерах это remux -c copy,
# без перекодирования.
#
# Версия зафиксирована явно и проверяется по контрольной сумме. Обновление
# yt-dlp должно быть осознанной пересборкой с правкой этих двух ARG, а не
# сюрпризом на очередном билде — но пересобирать образ нужно регулярно:
# YouTube ломает извлечение, и старый yt-dlp однажды просто перестаёт качать.
ARG YTDLP_VERSION=2026.08.19
ARG YTDLP_SHA256=1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6
RUN apk add --no-cache python3 ffmpeg ca-certificates \
    && wget -q -O /usr/local/bin/yt-dlp \
        "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" \
    && echo "${YTDLP_SHA256}  /usr/local/bin/yt-dlp" | sha256sum -c - \
    && chmod +x /usr/local/bin/yt-dlp \
    && yt-dlp --version \
    && ffmpeg -version | head -n 1

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE ${MEDIA_PORT:-3011}

CMD ["npm", "run", "media"]
