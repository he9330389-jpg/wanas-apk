export default function handler(req, res) {
  const path = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`).pathname
  if (path === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, service: 'wanas-api', version: '1.0.0' })
  }
  return res.status(404).json({ ok: false, error: 'Not found' })
}
