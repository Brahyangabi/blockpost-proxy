const express = require('express');
const url = require('url');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 10000;

// Health check endpoint for Render
app.get('/', (req, res) => res.send('WebSocket Proxy Running'));

const server = app.listen(PORT, () => {
  console.log(`Dynamic Proxy running on port ${PORT}`);
});

const wss = new WebSocket.Server({ 
  noServer: true,
  perMessageDeflate: false // Disables compression overhead on server
});

server.on('upgrade', (request, socket, head) => {
  // Disable Nagle's Algorithm on raw TCP connection for low latency
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 10000);

  const parsedUrl = url.parse(request.url, true);
  const targetUrl = parsedUrl.query.target;

  if (!targetUrl) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (clientSocket) => {
    const protocols = request.headers['sec-websocket-protocol']
      ? request.headers['sec-websocket-protocol'].split(',').map(s => s.trim())
      : undefined;

    const messageQueue = [];

    const serverSocket = new WebSocket(targetUrl, protocols, {
      perMessageDeflate: false,
      rejectUnauthorized: false,
      headers: {
        'User-Agent': request.headers['user-agent'] || '',
        'Origin': 'https://playblockpost.com'
      }
    });

    serverSocket.on('open', () => {
      // Empty the queue if frames came in while connecting
      while (messageQueue.length > 0) {
        const { data, isBinary } = messageQueue.shift();
        serverSocket.send(data, { binary: isBinary });
      }
    });

    clientSocket.on('message', (data, isBinary) => {
      if (serverSocket.readyState === WebSocket.OPEN) {
        serverSocket.send(data, { binary: isBinary });
      } else if (serverSocket.readyState === WebSocket.CONNECTING) {
        messageQueue.push({ data, isBinary });
      }
    });

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
});
