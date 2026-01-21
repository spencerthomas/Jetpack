const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
    // We only care about /v1/messages
    if (!req.url.endsWith('/messages')) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
    }

    const apiKey = req.headers['x-api-key'];
    const options = {
        hostname: 'openrouter.ai',
        path: '/api/v1/messages',
        method: req.method,
        headers: {
            ...req.headers,
            'Authorization': `Bearer ${apiKey}`,
        }
    };

    // Remove headers that might interfere or cause double auth
    delete options.headers['x-api-key'];
    delete options.headers['host'];
    delete options.headers['connection'];

    const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
        console.error('Proxy Error:', e);
        res.statusCode = 500;
        res.end('Internal Server Error');
    });

    req.pipe(proxyReq);
});

const PORT = process.env.PROXY_PORT || 9999;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Proxy listening on http://127.0.0.1:${PORT}`);
});
