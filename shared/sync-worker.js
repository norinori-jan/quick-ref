export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const syncPrefix = '/sync/';
    const appName = path.startsWith(syncPrefix) ? path.slice(syncPrefix.length).replace(/\/+$/, '') : path === '/sync' ? '' : '';

    if (!appName && path !== '/sync') {
      return new Response(JSON.stringify({ ok: false, error: 'invalid route' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'PUT') {
      if (!appName) {
        return new Response(JSON.stringify({ ok: false, error: 'appName is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      try {
        const payload = await request.json();
        if (!payload || typeof payload !== 'object') {
          return new Response(JSON.stringify({ ok: false, error: 'invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        await env.NORINORI_KV.put(`sync:${appName}`, JSON.stringify(payload));
        await env.NORINORI_KV.put('sync:last', JSON.stringify({ appName, payload, updatedAt: new Date().toISOString() }));
        return new Response(JSON.stringify({ ok: true, appName }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (request.method === 'GET') {
      const raw = await env.NORINORI_KV.get(`sync:${appName}`);
      if (!raw) {
        return new Response(JSON.stringify(null), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
};
