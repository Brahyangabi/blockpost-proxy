const WebSocket = require('ws');

// Render sets the PORT environment variable automatically
const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket proxy running on port ${PORT}`);

wss.on('connection', (clientSocket) => {
  console.log('Client connected. Forwarding to Blockpost server...');

  // Connect directly to the game server on port 41999
  const serverSocket = new WebSocket('wss://playblockpost.com:41999');

  serverSocket.on('open', () => {
    console.log('Connected to target game server!');
  });

  // Relay data: Browser -> Game Server
  clientSocket.on('message', (data) => {
    if (serverSocket.readyState === WebSocket.OPEN) {
      serverSocket.send(data);
    }
  });

  // Relay data: Game Server -> Browser
  serverSocket.on('message', (data) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(data);
    }
  });

  clientSocket.on('close', () => serverSocket.close());
  serverSocket.on('close', () => clientSocket.close());
  clientSocket.on('error', (err) => console.error('Client error:', err));
  serverSocket.on('error', (err) => console.error('Target server error:', err));
});
