import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';

export async function fetchTranslationQuote(symbol) {
  try {
    let encoded = symbol.split(':').slice(1).join(':');
    try {
      encoded = decodeURIComponent(encoded);
    } catch {}
    const text = Buffer.from(encoded, 'base64').toString('utf-8');
    console.log('[Translate] 待翻译长度:', text.length, '前 100 字符:', text.slice(0, 100));

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const r = await providerFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }, { provider: 'google:translate', timeoutMs: QUOTE_TIMEOUTS.translate });
    if (!r.ok) {
      console.warn('[Translate] Google 返回', r.status);
      return { symbol, error: `Translate 失败 ${r.status}`, original: text.slice(0, 50) };
    }
    const json = await r.json();
    const sentences = json[0] || [];
    const translatedParts = sentences.map(item => item[0] || '').join('');
    console.log('[Translate] 返回长度:', translatedParts.length);
    return {
      symbol,
      translated: translatedParts,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[Translate] 错误:', e.message);
    return { symbol, error: `Translate 错误: ${e.message}` };
  }
}
