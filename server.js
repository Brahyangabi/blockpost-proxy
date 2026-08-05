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
  perMessageDeflate: false // Prevents CPU compression lag spikes
});

server.on('upgrade', (request, socket, head) => {
  // Disable Nagle's algorithm on incoming client connection
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 5000);

  const parsedUrl = url.parse(request.url, true);
  const targetUrl = parsedUrl.query.target;

  if (!targetUrl) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (clientSocket) => {
    // Disable Nagle's on the client WebSocket underlying stream
    if (clientSocket._socket) {
      clientSocket._socket.setNoDelay(true);
    }

    const protocols = request.headers['sec-websocket-protocol']
      ? request.headers['sec-websocket-protocol'].split(',').map(s => s.trim())
      : undefined;

    const serverSocket = new WebSocket(targetUrl, protocols, {
      perMessageDeflate: false,
      rejectUnauthorized: false,
      headers: {
        'User-Agent': request.headers['user-agent'] || '',
        'Origin': 'https://playblockpost.com'
      }
    });

    serverSocket.on('open', () => {
      // Disable Nagle's on outgoing server stream
      if (serverSocket._socket) {
        serverSocket._socket.setNoDelay(true);
        serverSocket._socket.setKeepAlive(true, 5000);
      }
    });

    // Zero-Buffering Routing: If server isn't open, DROP packet immediately.
    // Do NOT queue position/input frames—queued old frames cause rubberbanding/ping spikes.
    clientSocket.on('message', (data, isBinary) => {
      if (serverSocket.readyState === WebSocket.OPEN) {
        serverSocket.send(data, { binary: isBinary });
      }
    });

    serverSocket.on('message', (data, isBinary) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(data, { binary: isBinary });
      }
    });

    // Immediate cleanup to stop memory leaks
    const cleanup = () => {
      try { clientSocket.close(); } catch(e){}
      try { serverSocket.close(); } catch(e){}
    };

    clientSocket.on('close', cleanup);
    serverSocket.on('close', cleanup);
    clientSocket.on('error', cleanup);
    serverSocket.on('error', cleanup);
  });
});
