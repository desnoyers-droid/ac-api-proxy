export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const checks = {
    proxy:    'operational',
    pappers:  process.env.PAPPERS_API_KEY  ? 'configured' : 'MISSING',
    linkedin: process.env.RAPIDAPI_KEY     ? 'configured' : 'MISSING',
    auth:     process.env.AC_SECRET_TOKEN  ? 'enabled'    : 'disabled',
    timestamp: new Date().toISOString(),
    version:  '1.0.0',
  };
  const allOk = checks.pappers === 'configured' && checks.linkedin === 'configured';
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', ...checks });
}