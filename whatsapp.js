// Conexao do WhatsApp (Baileys). Mantem o numero conectado e troca mensagens com o cerebro.
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'node:fs';
import { bridge } from './bridge.js';

const AUTH_DIR = process.env.AUTH_DIR || './.auth';
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

export const state = {
  status: 'starting',
  qrImage: null,
  phone: null,
  name: null,
  connectedAt: null,
  lastError: null,
  lastMessageAt: null,
  sentCount: 0,
  receivedCount: 0,
};

let sock = null;
let reconnectTimer = null;
let restarting = false;

function extractText(message) {
  if (!message) return '';
  const inner =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message;
  return (
    inner.conversation ||
    inner.extendedTextMessage?.text ||
    inner.imageMessage?.caption ||
    inner.videoMessage?.caption ||
    inner.documentMessage?.caption ||
    ''
  ).trim();
}

async function pushSession() {
  try {
    const status =
      state.status === 'open' ? 'open' : state.status === 'qr' ? 'qr' : 'disconnected';
    await bridge('session', {
      status,
      qrImage: state.status === 'qr' ? state.qrImage : null,
      phone: state.phone,
      connectedName: state.name,
    });
  } catch (err) {
    console.error('[session]', err.message);
  }
}

async function connect() {
  if (restarting) return;
  restarting = true;

  try {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    let version;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch {
      version = undefined;
    }

    sock = makeWASocket({
      version,
      auth: authState,
      logger,
      printQRInTerminal: false,
      markOnline: false,
      syncFullHistory: false,
      browser: ['Dental IA', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          state.qrImage = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          state.status = 'qr';
          await pushSession();
        } catch (err) {
          console.error('[qr]', err.message);
        }
      }

      if (connection === 'open') {
        const jid = sock?.user?.id || '';
        state.status = 'open';
        state.qrImage = null;
        state.phone = jid.split(':')[0].split('@')[0] || null;
        state.name = sock?.user?.name || null;
        state.connectedAt = new Date().toISOString();
        state.lastError = null;
        console.log('[wa] conectado como', state.phone);
        await pushSession();
      }

      if (connection === 'close') {
        const code =
          lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.statusCode ?? null;
        const loggedOut = code === DisconnectReason.loggedOut;

        state.status = 'disconnected';
        state.qrImage = null;
        state.lastError = code ? `conexao encerrada (codigo ${code})` : 'conexao encerrada';

        if (loggedOut) {
          console.log('[wa] sessao encerrada pelo usuario - limpando credenciais');
          state.phone = null;
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch (err) {
            console.error('[wa] falha ao limpar sessao', err.message);
          }
        }

        await pushSession();

        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          restarting = false;
          connect().catch((err) => console.error('[wa] reconnect', err.message));
        }, loggedOut ? 1500 : 4000);
        return;
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages || []) {
        try {
          if (!msg.message || msg.key?.fromMe) continue;
          const jid = msg.key?.remoteJid || '';
          if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;

          const text = extractText(msg.message);
          if (!text) continue;

          const phone = jid.split('@')[0].split(':')[0];
          state.receivedCount += 1;
          state.lastMessageAt = new Date().toISOString();

          await bridge('inbound', {
            phone,
            text,
            contactName: msg.pushName || null,
            waMessageId: msg.key?.id || null,
          });
        } catch (err) {
          console.error('[inbound]', err.message);
        }
      }
    });

    restarting = false;
    await pushSession();
  } catch (err) {
    restarting = false;
    state.status = 'disconnected';
    state.lastError = err.message;
    console.error('[wa] falha ao iniciar', err.message);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect().catch(() => {}), 5000);
  }
}

export async function sendText(phone, text) {
  if (!sock || state.status !== 'open') throw new Error('WhatsApp nao esta conectado');
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) throw new Error('Telefone invalido');
  const jid = `${digits}@s.whatsapp.net`;
  const sent = await sock.sendMessage(jid, { text });
  state.sentCount += 1;
  return sent;
}

async function flushOutbox() {
  if (state.status !== 'open') return;
  try {
    const res = await bridge('pending');
    const messages = res?.messages || [];
    for (const m of messages) {
      if (!m.phone) {
        await bridge('delivered', { id: m.id, ok: false, error: 'conversa sem telefone' });
        continue;
      }
      try {
        const sent = await sendText(m.phone, m.text);
        await bridge('delivered', {
          id: m.id,
          ok: true,
          waMessageId: sent?.key?.id || null,
        });
      } catch (err) {
        await bridge('delivered', { id: m.id, ok: false, error: err.message });
      }
    }
  } catch (err) {
    if (!String(err.message).includes('nao esta conectado')) {
      console.error('[outbox]', err.message);
    }
  }
}

export async function logout() {
  try {
    if (sock) await sock.logout();
  } catch (err) {
    console.error('[wa] logout', err.message);
  }
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch (err) {
    console.error('[wa] limpar credenciais', err.message);
  }
  state.status = 'disconnected';
  state.qrImage = null;
  state.phone = null;
  await pushSession();
  setTimeout(() => connect().catch(() => {}), 1500);
}

export async function startWhatsApp() {
  await connect();
  await bridge('setup').catch((err) => console.error('[setup]', err.message));

  setInterval(pushSession, 15000);
  setInterval(flushOutbox, 4000);
  setInterval(() => {
    if (!sock && state.status !== 'open') connect().catch(() => {});
  }, 60000);
}

function bridgeHost() {
  const url = process.env.BRIDGE_URL || '';
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 80);
  }
}

/** Testa de verdade se a ponte consegue falar com o cerebro (wa-agent). */
export async function testBackend() {
  if (!process.env.BRIDGE_URL) {
    return {
      ok: false,
      wrongUrl: false,
      message:
        'A variavel BRIDGE_URL esta vazia no Render. Copie o endereco do Backend no passo a passo do painel.',
    };
  }
  if (!process.env.WA_BRIDGE_SECRET) {
    return {
      ok: false,
      wrongUrl: false,
      message:
        'A variavel WA_BRIDGE_SECRET esta vazia no Render. Ela precisa ser identica a senha salva no Backend.',
    };
  }
  if (/onrender\.com/i.test(process.env.BRIDGE_URL)) {
    return {
      ok: false,
      wrongUrl: true,
      message:
        'BRIDGE_URL esta apontando para o proprio Render. Ela deve apontar para o Backend, terminando em /functions/v1/wa-agent.',
    };
  }

  try {
    const res = await bridge('setup');
    const clinicName = res?.clinic?.name ? ` da clinica ${res.clinic.name}` : '';
    return { ok: true, wrongUrl: false, message: `Backend respondeu e liberou o acesso${clinicName}.` };
  } catch (err) {
    return { ok: false, wrongUrl: false, message: err.message };
  }
}

/** Retrato completo do servico, usado pelo painel para diagnosticar sem ler logs. */
export async function diagnose() {
  const backend = await testBackend();
  return {
    status: state.status,
    lastError: state.lastError,
    qrImage: state.status === 'qr' ? state.qrImage : null,
    phone: state.phone,
    name: state.name,
    connectedAt: state.connectedAt,
    uptime: Math.round(process.uptime()),
    received: state.receivedCount,
    sent: state.sentCount,
    socket: Boolean(sock),
    hasCreds: fs.existsSync(`${AUTH_DIR}/creds.json`),
    env: {
      bridgeUrl: Boolean(process.env.BRIDGE_URL),
      bridgeSecret: Boolean(process.env.WA_BRIDGE_SECRET),
      anonKey: Boolean(process.env.SUPABASE_ANON_KEY),
      bridgeHost: bridgeHost(),
    },
    backend,
  };
}

/** Apaga a sessao salva e comeca do zero para gerar um QR Code novo. */
export async function resetSession() {
  await logout();
  return true;
}
