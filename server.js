const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');
const https = require('https');

const app = express();

// Disable Express metadata overhead
app.disable('x-powered-by');
app.disable('etag');

// Optimize HTTP/HTTPS agents for real-time WebSocket traffic
const agentOptions = {
  keepAlive: true,
  keepAliveMsecs: 10000,
  noDelay: true // Disables Nagle's algorithm for faster packet dispatch
};

const httpAgent = new http.Agent(agentOptions);
const httpsAgent = new https.Agent(agentOptions);

// Ultra-lean proxy middleware
const wsProxy = createProxyMiddleware({
  target: 'wss://playblockpost.com:41999', // Default fallback
  router: (req) => {
    // Extract target from query string (?target=wss://...)
    return req.query.target || undefined;
  },
  ws: true,
  changeOrigin: true,
  logLevel: 'silent', // STOP console logging to prevent thread blocking
  agent: httpAgent,
  agentOptions: { https: httpsAgent },
  onError: (err, req, res) => {
    // Silent fail to avoid throwing heavy stack traces during network hiccups
    if (res && !res.headersSent) {
      res.writeHead(502);
      res.end('Proxy Error');
    }
  }
});

// Pass all traffic directly into the proxy
app.use('/', wsProxy);

const server = app.listen(process.env.PORT || 3000);

// Fast upgrade handler for WebSockets
server.on('upgrade', (req, socket, head) => {
  // Set TCP socket options immediately on incoming browser connection
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 10000);
  
  wsProxy.upgrade(req, socket, head);
});
