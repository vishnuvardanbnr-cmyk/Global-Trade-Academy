import http from "http";

const FROM_PORT = Number(process.env.FROM_PORT ?? 8080);
const TO_PORT = Number(process.env.TO_PORT ?? 5000);

const server = http.createServer((req, res) => {
  const options = {
    hostname: "localhost",
    port: TO_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${TO_PORT}` },
  };
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxy.on("error", () => {
    res.writeHead(502);
    res.end("Bad Gateway");
  });
  req.pipe(proxy, { end: true });
});

server.listen(FROM_PORT, "0.0.0.0", () => {
  console.log(`Port forwarder: ${FROM_PORT} → ${TO_PORT}`);
});
