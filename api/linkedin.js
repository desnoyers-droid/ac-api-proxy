const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const SECRET_TOKEN = process.env.AC_SECRET_TOKEN;

function json(res, code, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(code).json(data);
}

function cleanUsername(raw) {
  return raw.replace(/https?:\/\//i, '').replace(/^www\./, '')
    .replace(/^linkedin\.com\/in\//i, '').replace(/\/$/, '').trim();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  if (SECRET_TOKEN) {
    const provided = (req.headers['authorization'] || '').replace('Bearer ', '') || req.query.token || '';
    if (provided !== SECRET_TOKEN) return json(res, 401, { error: 'Unauthorized' });
  }

  const raw = req.query.username || '';
  if (!raw) return json(res, 400, { error: 'Parametre manquant', message: '?username= requis' });
  const username = cleanUsername(raw);
  if (!username || username.length < 2) return json(res, 400, { error: 'Username invalide', received: raw });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(
      `https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/user/profile?username=${encodeURIComponent(username)}`,
      { signal: controller.signal, headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': 'fresh-linkedin-scraper-api.p.rapidapi.com' } }
    );
    clearTimeout(timer);
    if (!r.ok) {
      if (r.status === 404) return json(res, 404, { error: 'Profil introuvable', username });
      if (r.status === 429) return json(res, 429, { error: 'Rate limit LinkedIn', message: 'Reessayez dans quelques secondes' });
      return json(res, 502, { error: 'Erreur API LinkedIn', status: r.status });
    }
    const body = await r.json();
    const p = body?.data || body;
    const avatar = Array.isArray(p.avatar) ? p.avatar.find(a => a.url)?.url : (p.avatar || p.profile_picture || null);
    const bio = (p.summary || p.about || '').replace(/[^\x00-\x7FA-Za-z\u00C0-\u024F\s\-.,;:!?'"()]/g, '').trim();
    const experiences = (p.experiences || p.experience || []).slice(0, 5).map(e => ({
      titre: e.title, entreprise: e.company_name || e.company,
      debut: e.starts_at?.year || null, fin: e.ends_at?.year || 'Present'
    }));
    const formations = (p.educations || p.education || []).slice(0, 3).map(f => ({
      ecole: f.school_name || f.school, diplome: f.degree_name || f.degree, annee: f.ends_at?.year
    }));
    const data = {
      nom: p.last_name, prenom: p.first_name,
      nom_complet: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' '),
      titre: p.headline || p.occupation, localisation: p.location,
      bio, bio_courte: bio.length > 300 ? bio.substring(0, 300) + '...' : bio,
      poste_actuel: experiences[0] || null, experiences, formations,
      avatar_url: avatar, linkedin_url: `https://www.linkedin.com/in/${username}`,
      source: 'Fresh LinkedIn Scraper API', timestamp: new Date().toISOString()
    };
    const exp3 = experiences.slice(0, 3).map(e => `  - ${e.titre || ''} @ ${e.entreprise || ''} (${e.debut || '?'} - ${e.fin})`).join('\n');
    const resume = [
      `Porteur : ${data.nom_complet || 'N/A'}`,
      `Titre : ${data.titre || 'N/A'}`,
      `LinkedIn : ${data.linkedin_url}`,
      data.bio_courte ? `Bio : ${data.bio_courte}` : '',
      formations[0] ? `Formation : ${formations[0].diplome || ''} - ${formations[0].ecole || ''}` : '',
      experiences.length > 0 ? `Experiences :\n${exp3}` : ''
    ].filter(Boolean).join('\n');
    return json(res, 200, { success: true, data, resume });
  } catch (err) {
    if (err.name === 'AbortError') return json(res, 504, { error: 'Timeout', message: 'API LinkedIn timeout 10s' });
    return json(res, 502, { error: 'Erreur reseau', message: err.message });
  }
}