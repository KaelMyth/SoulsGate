// Маленький локальный сервер для проверки на телефоне в одной Wi-Fi сети.
// Запуск: node serve.js   (потом открыть на iPhone адрес «С телефона»)
// Нужен только Node.js. Для хостинга в интернете этот файл не нужен.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8080;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (urlPath.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Не найдено: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store', // при каждой правке на телефоне сразу видна новая версия
    });
    res.end(data);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log('\nС компьютера:  http://localhost:' + port);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) console.log('С телефона:    http://' + n.address + ':' + port + '   (телефон в той же Wi-Fi сети)');
    }
  }
  console.log('\nОстановить: Ctrl+C\n');
});
