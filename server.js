const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket proxy running on port ${PORT}`);

wss.on('connection', (clientSocket, req) => {
  console.log('Client connected from browser. Forwarding to target server...');

  // Extract subprotocols if Unity requested any (e.g., binary, photon, etc.)
  const protocols = req.headers['sec-websocket-protocol']
    ? req.headers['sec-websocket-protocol'].split(',').map(s => s.trim())
    : undefined;

  // Queue to store incoming packets while connecting to the target server
  const messageQueue = [];

  const serverSocket = new WebSocket('wss://playblockpost.com:41999', protocols, {
    perMessageDeflate: false,
    rejectUnauthorized: false,
    headers: {
      'User-Agent': req.headers['user-agent'] || '',
      'Origin': req.headers['origin'] || 'https://playblockpost.com'
    }
  });

  // Flush queued messages once the target connection is ready
  serverSocket.on('open', () => {
    console.log('Connected to target backend. Flushing queue...');
    while (messageQueue.length > 0) {
      const { data, isBinary } = messageQueue.shift();
      serverSocket.send(data, { binary: isBinary });
    }
  });

  // Relay Browser -> Target Server (with queue support)
  clientSocket.on('message', (data, isBinary) => {
    if (serverSocket.readyState === WebSocket.OPEN) {
      serverSocket.send(data, { binary: isBinary });
    } else if (serverSocket.readyState === WebSocket.CONNECTING) {
      // Store packet so Unity's join handshake isn't lost
      messageQueue.push({ data, isBinary });
    }
  });

  // Relay Target Server -> Browser
  serverSocket.on('message', (data, isBinary) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(data, { binary: isBinary });
    }
  });

  // Ping / Pong relaying
  clientSocket.on('ping', (data) => {
    if (serverSocket.readyState === WebSocket.OPEN) serverSocket.ping(data);
  });
  serverSocket.on('ping', (data) => {
    if (clientSocket.readyState === WebSocket.OPEN) clientSocket.ping(data);
  });

  clientSocket.on('pong', (data) => {
    if (serverSocket.readyState === WebSocket.OPEN) serverSocket.pong(data);
  });
  serverSocket.on('pong', (data) => {
    if (clientSocket.readyState === WebSocket.OPEN) clientSocket.pong(data);
  });

  // Clean handling of disconnections & errors
  clientSocket.on('close', () => serverSocket.close());
  serverSocket.on('close', () => clientSocket.close());

  clientSocket.on('error', (err) => console.error('Browser socket error:', err.message));
  serverSocket.on('error', (err) => console.error('Target server error:', err.message));
});
