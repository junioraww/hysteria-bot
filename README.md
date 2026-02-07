<h1 align="center">hysteria-bot WIP</h1>
<p align="center">Бот для удобного управления и выдачи конфигов <a href="https://github.com/apernet/hysteria">Hysteria2</a></p>

<div align="center">
    <img src="https://img.shields.io/badge/MIT-green?style=for-the-badge"/>
    <img src="https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E"/>
    <img src="https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge"/>
</div>

## Особенности
- <b>Управление конфигами</b>  
Команды <b>/add, /del, /list</b> — за счет задействования <a href="https://v2.hysteria.network/docs/advanced/Traffic-Stats-API/">Traffic Stats API</a>, при удалении конфига, клиенты сразу отключаются. Также имеется команда /clients

- <b>Генерация QR-кода</b>  
Быстрая и легковесная генерация QR-кода с <b>кастомным изображением</b> (без задействования тяжелых sharp и canvas!)

- <b>Легко запустить</b>
Проект обернут в ```docker-compose.yml```, для запуска нужен токен бота, любой токен для Traffic Stats API (указать в hysteria ```config.yml``` и bot ```.env```)

> Для работы Hysteria2 нужен <b>рабочий домен!</b>
## В планах
- Упрощенная панель управления кнопками
- Подробная статистика по использованию трафика
- Mock-страница для тех, кто подключается с браузера
- Более подробный ```README.md```

## Использование
TODO

## Разработка
TODO

## Ресурсы
TODO
