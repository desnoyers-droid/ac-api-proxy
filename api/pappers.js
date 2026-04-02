const PAPPERS_API_KEY = process.env.PAPPERS_API_KEY;
const SECRET_TOKEN   = process.env.AC_SECRET_TOKEN;

function json(res, code, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(code).json(data);
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

  const siren = (req.query.siren || '').replace(/\s/g, '');
  if (!siren) return json(res, 400, { error: 'Parametre manquant', message: '?siren= requis' });
  if (!/^\d{9}$/.test(siren)) return json(res, 400, { error: 'SIREN invalide', message: '9 chiffres requis', received: siren });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(`https://api.pappers.fr/v2/entreprise?siren=${siren}&api_token=${PAPPERS_API_KEY}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) {
      if (r.status === 404) return json(res, 404, { error: 'Societe introuvable', siren });
      return json(res, 502, { error: 'Erreur API Pappers', status: r.status });
    }
    const p = await r.json();
    const dirigeants = (p.dirigeants || []).map(d => ({ nom: d.nom, prenom: d.prenom, qualite: d.qualite }));
    const actionnaires = (p.actionnaires || []).map(a => ({ nom: a.nom_entreprise || [a.prenom, a.nom].filter(Boolean).join(' '), pct: a.pourcentage_parts }));
    const principal = actionnaires.reduce((m, a) => (a.pct || 0) > (m.pct || 0) ? a : m, actionnaires[0] || {});
    const data = {
      raison_sociale: p.nom_entreprise, forme_juridique: p.forme_juridique,
      siren: p.siren, siret_siege: p.siret_siege, date_creation: p.date_creation_formate,
      siege_social: { adresse: p.siege?.adresse_ligne_1, code_postal: p.siege?.code_postal, ville: p.siege?.ville,
        adresse_complete: [p.siege?.adresse_ligne_1, p.siege?.code_postal, p.siege?.ville].filter(Boolean).join(', ') },
      activite: p.libelle_code_naf, code_naf: p.code_naf, capital_social: p.capital,
      dirigeants, actionnaires, actionnaire_principal_nom: principal.nom, actionnaire_principal_pct: principal.pct,
      en_procedure: p.en_procedure_collective || false, source: 'Pappers API v2', timestamp: new Date().toISOString()
    };
    const resume = [
      `Societe : ${data.raison_sociale} (${data.forme_juridique})`,
      `SIREN : ${data.siren} | Cree le : ${data.date_creation}`,
      `Siege : ${data.siege_social?.adresse_complete}`,
      `Activite : ${data.activite} (NAF ${data.code_naf})`,
      `Capital : ${data.capital_social ? data.capital_social.toLocaleString('fr-FR') + ' EUR' : 'N/A'}`,
      `Dirigeant : ${dirigeants[0] ? [dirigeants[0].prenom, dirigeants[0].nom, '(' + dirigeants[0].qualite + ')'].filter(Boolean).join(' ') : 'N/A'}`,
      `Actionnaire principal : ${principal.nom ? principal.nom + ' - ' + principal.pct + '%' : 'N/A'}`,
      data.en_procedure ? 'ATTENTION : Societe en procedure collective' : ''
    ].filter(Boolean).join('\n');
    return json(res, 200, { success: true, data, resume });
  } catch (err) {
    if (err.name === 'AbortError') return json(res, 504, { error: 'Timeout', message: 'API Pappers timeout 8s' });
    return json(res, 502, { error: 'Erreur reseau', message: err.message });
  }
}