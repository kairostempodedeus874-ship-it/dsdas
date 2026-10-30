import express from 'express';
import { startWhatsApp, state, logout, diagnose, resetSession } from './whatsapp.js';

const app = express();
const PORT = Number(process.env.PORT || 10000);

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-panel-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.get('/', (_req, res) => {
  res.json({ service: 'dentalia-wa-service', status: state.status, ok: true });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), status: state.status });
});

app.get('/api/status', (_req, res) => {
  res.json({
    status: state.status,
    phone: state.phone,
    name: state.name,
    connectedAt: state.connectedAt,
    lastError: state.lastError,
    received: state.receivedCount,
    sent: state.sentCount,
    qrImage: state.status === 'qr' ? state.qrImage : null,
  });
});

// Diagnostico completo: confere variaveis de ambiente e testa o backend de verdade.
app.get('/api/diagnose', async (_req, res) => {
  try {
    res.json(await diagnose());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function panelAllowed(req) {
  const token = req.headers['x-panel-token'] || '';
  const expected = process.env.WA_PANEL_TOKEN || '';
  return !expected || token === expected;
}

// Apaga a sessao salva para gerar um QR Code novo.
app.post('/api/reset', async (req, res) => {
  if (!panelAllowed(req)) return res.status(401).json({ error: 'Acesso negado' });
  try {
    await resetSession();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', async (req, res) => {
  if (!panelAllowed(req)) {
    return res.status(401).json({ error: 'Acesso negado' });
  }
  await logout();
  return res.json({ ok: true });
});

app.use((_req, res) => res.status(404).json({ error: 'Rota nao encontrada' }));

app.listen(PORT, () => {
  console.log(`[http] ouvindo na porta ${PORT}`);
  startWhatsApp().catch((err) => console.error('[wa] start', err.message));
});
