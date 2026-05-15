const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'drumtwin-api', version: '0.1.0' }));
});

server.listen(PORT, () => {
  console.log(`DrumTwin API listening on port ${PORT}`);
});
