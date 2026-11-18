// Версия на стартовом экране: короткий хеш последнего коммита main (спрашиваем у GitHub, так это всегда то, что на Pages)
// и очень краткое описание обновления из version.json (его правят вместе с обновлением).
// Если GitHub не ответил (нет сети, лимит запросов), показываем хеш, записанный в version.json.

async function getJson(url, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** repo: 'Owner/Name'. Возвращает { version: 'v9f3a23f', notes: '...' }, не бросает. */
export async function loadBuildInfo(repo) {
  let stamped = { commit: '', notes: '' };
  try { stamped = await getJson('./version.json', 3000); } catch (e) { /* файла нет: покажем прочерк */ }
  let sha = '';
  try {
    const c = await getJson(`https://api.github.com/repos/${repo}/commits/main`, 2000);
    sha = String(c.sha || '').slice(0, 7);
  } catch (e) { /* GitHub не ответил */ }
  sha = sha || stamped.commit || '';
  return { version: sha ? `v${sha}` : 'v—', notes: stamped.notes || '' };
}
