const express = require('express');
const url = require('url');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('WebSocket Proxy Running'));

const server = app.listen(PORT, () => {
  console.log(`Dynamic Proxy running on port ${PORT}`);
});

const wss = new WebSocket.Server({ 
  noServer: true,
  perMessageDeflate: false 
});

server.on('upgrade', (request, socket, head) => {
  // Disable Nagle's Algorithm on client TCP stream
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

    let messageQueue = [];
    const MAX_QUEUE_SIZE = 50; // Prevent runaway memory usage

    const serverSocket = new WebSocket(targetUrl, protocols, {
      perMessageDeflate: false,
      rejectUnauthorized: false,
      headers: {
        'User-Agent': request.headers['user-agent'] || '',
        'Origin': 'https://playblockpost.com'
      }
    });

    // Disable Nagle's Algorithm on outbound target socket
    serverSocket.on('open', () => {
      if (serverSocket._socket) {
        serverSocket._socket.setNoDelay(true);
        serverSocket._socket.setKeepAlive(true, 10000);
      }

      // Flush queue
      for (let i = 0; i < messageQueue.length; i++) {
        const item = messageQueue[i];
        serverSocket.send(item.data, { binary: item.isBinary });
      }
      messageQueue = null; // Clear queue reference for garbage collection
    });

    clientSocket.on('message', (data, isBinary) => {
      if (serverSocket.readyState === WebSocket.OPEN) {
        serverSocket.send(data, { binary: isBinary });
      } else if (serverSocket.readyState === WebSocket.CONNECTING && messageQueue) {
        if (messageQueue.length < MAX_QUEUE_SIZE) {
          messageQueue.push({ data, isBinary });
        }
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
