@echo off
heroku config:set -a hris-api-dev "DATABASE_URL=mongodb+srv://1bissolutionstech:28eHpw2mcn51rTwU@1bis.6km3g.mongodb.net/dev1-prisma-onebisDB?retryWrites=true&w=majority&appName=1bis"
heroku config:set -a hris-api-dev JWT_SECRET=TestSecretKEy12345
heroku config:set -a hris-api-dev CLOUDINARY_CLOUD_NAME=dmhxygxg9
heroku config:set -a hris-api-dev CLOUDINARY_API_KEY=931468895664244
heroku config:set -a hris-api-dev CLOUDINARY_API_SECRET=3VlK6uVQorOQb01vwndHNSlAa-8
heroku config:set -a hris-api-dev "CORS_ORIGINS=https://hris-api-dev.herokuapp.com,http://localhost:3000,http://localhost:5173,http://localhost:3001,http://localhost:4173"
heroku config:set -a hris-api-dev CORS_CREDENTIALS=true
heroku config:set -a hris-api-dev BETTER_STACK_SOURCE_TOKEN=b5yYv9bssbxcJaJ7uguo8WX1
heroku config:set -a hris-api-dev "BETTER_STACK_HOST=https://s1349486.eu-nbg-2.betterstackdata.com"
heroku config:set -a hris-api-dev REDIS_ENABLED=true
echo All environment variables have been set!
