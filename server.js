const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket proxy running on port ${PORT}`);

wss.on('connection', (clientSocket, req) => {
  console.log('Client connected from browser. Forwarding to target server...');

  // Connect to the actual backend server
  const serverSocket = new WebSocket('ws://playblockpost.com:41999', {
    perMessageDeflate: false, // Disable compression overhead to prevent latency drops
    rejectUnauthorized: false // Ignore SSL cert discrepancies between proxy and backend
  });

  // Relay raw binary packets from Browser -> Game Server
  clientSocket.on('message', (data, isBinary) => {
    if (serverSocket.readyState === WebSocket.OPEN) {
      serverSocket.send(data, { binary: isBinary });
    }
  });

  // Relay raw binary packets from Game Server -> Browser
  serverSocket.on('message', (data, isBinary) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(data, { binary: isBinary });
    }
  });

  // Relay Ping/Pong Heartbeats to prevent timeouts
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
