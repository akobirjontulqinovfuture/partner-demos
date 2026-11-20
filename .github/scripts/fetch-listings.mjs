// Reads the PUBLIC web preview of t.me/s/SmartBookN1 and writes listings.json (newest first).
// No login, no API keys. Usage: node fetch-listings.mjs out.json
import fs from 'fs';
const CH = 'SmartBookN1', UA = { 'User-Agent': 'Mozilla/5.0 (compatible; partner-demos-listings/1.0)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dec = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
async function page(q) { for (let i = 0; i < 3; i++) { try { const r = await fetch(`https://t.me/s/${CH}${q}`, { headers: UA }); if (r.ok) return await r.text(); } catch (e) {} await sleep(1500); } return ''; }
function parse(html) {
  return html.split('<div class="tgme_widget_message_wrap').slice(1).map(b => {
    const id = (b.match(/data-post="[^"/]+\/(\d+)"/) || [])[1]; if (!id) return null;
    const tm = b.match(/js-message_text[^>]*>([\s\S]*?)<\/div>/); if (!tm) return null;
    const raw = dec(tm[1].replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''));
    const img = (b.match(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/) || [])[1] || null;
    const date = (b.match(/datetime="([^"]+)"/) || [])[1] || null;
    return { id: +id, raw, img, date };
  }).filter(Boolean);
}
const clean = s => s.replace(/([0-9])\uFE0F?\u20E3/g, '$1').replace(/💲/g, '$').replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, ' ').replace(/[ \t]+/g, ' ');
function field(t, re) { const m = t.match(re); return m ? m[1].replace(/\s+/g, ' ').trim().replace(/[:\s]+$/, '') : null; }
function toItem(p) {
  const t = clean(p.raw);
  const title = field(t, /Nomi\s*:?\s*([^\n]+?)(?=\s*(?:Rangi|Operativ|Asosiy|Protsessor|Ekran|Ram|\n|$))/i);
  if (!title) return null;
  const cat = /mac\s*book/i.test(title) ? 'macbook' : /ipad/i.test(title) ? 'ipad' : /play\s*station|\bps\s*[345]\b/i.test(title) ? 'playstation' : /iphone/i.test(title) ? 'iphone' : /watch/i.test(title) ? 'watch' : 'noutbuk';
  let price = field(t, /N\s*arxi\s*:?\s*([0-9][0-9 .,]*\s*(?:\$|so['‘’`]?m|mln)?)/i);
  if (price) { price = price.replace(/\s+/g, ''); if (/\$$/.test(price)) price = '$' + price.slice(0, -1); if (!/[0-9]{2,}/.test(price)) price = null; }
  const specs = {
    color: field(t, /Rangi\s*:?\s*([^\n]+?)(?=\s*(?:Operativ|Asosiy|Protsessor|Ekran|Ram|Ko|\n|$))/i),
    ram: field(t, /(?:Operativ xotira|Ram)\s*:?\s*([0-9]+\s*gb[^\n]*?)(?=\s*(?:Asosiy|Protsessor|Ekran|SSD|\n|$))/i),
    ssd: field(t, /(?:Asosiy xotira|SSD|storage)\s*:?\s*([0-9.]+\s*(?:gb|tb)[^\n]*?)(?=\s*(?:Protsessor|Ekran|Batereya|Ko|\n|$))/i),
    cpu: field(t, /Protsessor\s*:?\s*([^\n]+?)(?=\s*(?:Batereya|Ekran|Touch|Video|\n|$))/i),
    battery: field(t, /Batereya\s*:?\s*([^\n]+?)(?=\s*(?:Touch|Ekran|Holat|\n|$))/i),
    screen: field(t, /Ekran\s*:?\s*([^\n]+?)(?=\s*(?:N\s*arxi|Holat|\n|$))/i),
  };
  Object.keys(specs).forEach(k => { if (!specs[k] || specs[k].length > 40) delete specs[k]; });
  return { id: p.id, url: `https://t.me/${CH}/${p.id}`, date: p.date, cat, title: title.slice(0, 60), price, specs, img: p.img };
}
const seen = new Map(); let before = '';
for (let i = 0; i < 10; i++) { const h = await page(before ? `?before=${before}` : ''); const ps = parse(h); if (!ps.length) break; ps.forEach(p => seen.set(p.id, p)); before = Math.min(...ps.map(p => p.id)); await sleep(700); }
for (const q of ['iPad', 'iwatch', 'Playstation', 'Lenovo', 'HP', 'Asus']) { parse(await page(`?q=${encodeURIComponent(q)}`)).forEach(p => seen.set(p.id, p)); await sleep(700); }
const items = [...seen.values()].map(toItem).filter(Boolean).sort((a, b) => b.id - a.id);
const capped = []; const per = {}; for (const it of items) { per[it.cat] = (per[it.cat] || 0) + 1; if (per[it.cat] <= 40) capped.push(it); }
const out = process.argv[2] || 'listings.json';
let prev = null; try { prev = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) {}
const same = prev && JSON.stringify(prev.items.map(i => [i.id, i.price, i.img && i.img.slice(0, 60)])) === JSON.stringify(capped.map(i => [i.id, i.price, i.img && i.img.slice(0, 60)]));
if (!capped.length) { console.error('no items parsed; keeping previous file'); process.exit(0); }
fs.writeFileSync(out, JSON.stringify({ channel: CH, updated: same ? prev.updated : new Date().toISOString(), counts: per, items: capped }));
console.log(same ? 'unchanged' : 'updated', capped.length, JSON.stringify(per));
