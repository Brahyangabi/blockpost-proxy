const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket proxy running on port ${PORT}`);

wss.on('connection', (clientSocket, req) => {
  const protocols = req.headers['sec-websocket-protocol']
    ? req.headers['sec-websocket-protocol'].split(',').map(s => s.trim())
    : undefined;

  const messageQueue = [];

  const serverSocket = new WebSocket('wss://playblockpost.com:41999', protocols, {
    perMessageDeflate: false,
    rejectUnauthorized: false,
    headers: {
      'User-Agent': req.headers['user-agent'] || '',
      'Origin': req.headers['origin'] || 'https://playblockpost.com'
    }
  });

  serverSocket.on('open', () => {
    while (messageQueue.length > 0) {
      const { data, isBinary } = messageQueue.shift();
      serverSocket.send(data, { binary: isBinary });
    }
  });

  // Relay Browser -> Server
  clientSocket.on('message', (data, isBinary) => {
    if (serverSocket.readyState === WebSocket.OPEN) {
      serverSocket.send(data, { binary: isBinary });
    } else if (serverSocket.readyState === WebSocket.CONNECTING) {
      messageQueue.push({ data, isBinary });
    }
  });

  // Relay Server -> Browser
  serverSocket.on('message', (data, isBinary) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(data, { binary: isBinary });
    }
  });

  clientSocket.on('close', () => serverSocket.close());
  serverSocket.on('close', () => clientSocket.close());

  clientSocket.on('error', () => {});
  serverSocket.on('error', () => {});
});
