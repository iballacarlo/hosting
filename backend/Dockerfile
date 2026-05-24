FROM php:8.3-cli

RUN docker-php-ext-install pdo pdo_mysql

WORKDIR /app

COPY . .

EXPOSE 8080

CMD php -S 0.0.0.0:${PORT:-8080} router.php