const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const cfg = require('./config');
const { db } = require('./db');
require('./seed').run();
const V = require('./views');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const https = /^https:/.test(cfg.SITE_URL);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://i.ytimg.com'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ['https://www.youtube-nocookie.com', 'https://www.google.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      ...(https ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  hsts: https ? { maxAge: 15552000 } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(compression());
app.use(cookieParser());

app.get('/healthz', (req, res) => { db.prepare('SELECT 1').get(); res.send('ok'); });
app.use('/uploads', express.static(cfg.UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false, setHeaders: (res, f) => { if (f.endsWith('.pdf')) res.setHeader('Content-Disposition', 'inline'); } }));
app.use(express.static(path.join(cfg.ROOT, 'public'), { maxAge: cfg.PROD ? '7d' : 0, index: false, extensions: [] }));

app.use('/admin', (req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex'); next(); });
app.get('/admin', (req, res) => res.sendFile(path.join(cfg.ROOT, 'public', 'admin', 'index.html')));
app.use('/api/admin', require('./routes/admin'));
app.use(require('./routes/public'));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'not found' });
  res.status(404).type('html').send(V.notFound(V.ctxOf(req)));
});
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.originalUrl, err);
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: 'फ़ाइल बहुत बड़ी है।' });
  if (req.path.startsWith('/api/')) return res.status(err.status || 500).json({ ok: false, error: cfg.PROD ? 'सर्वर में समस्या हुई। कृपया दोबारा प्रयास करें।' : err.message });
  res.status(500).type('text').send('Server error');
});

app.listen(cfg.PORT, () => console.log(`BMM listening on :${cfg.PORT}  payment=${cfg.PAYMENT_MODE}  site=${cfg.SITE_URL}`));
