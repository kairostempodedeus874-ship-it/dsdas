// Comunicacao com o cerebro do robo (funcao wa-agent no Readdy Backend)
const BRIDGE_URL = process.env.BRIDGE_URL || '';
const BRIDGE_SECRET = process.env.WA_BRIDGE_SECRET || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

export async function bridge(action, payload = {}) {
  if (!BRIDGE_URL) throw new Error('BRIDGE_URL nao configurada');
  if (!BRIDGE_SECRET) throw new Error('WA_BRIDGE_SECRET nao configurada');

  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-secret': BRIDGE_SECRET,
      ...(ANON_KEY ? { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw.slice(0, 300) };
  }

  if (!res.ok) {
    throw new Error(data?.error || `Falha na ponte (HTTP ${res.status})`);
  }
  return data;
}
