const RATINGS = ['extreme fear', 'fear', 'neutral', 'greed', 'extreme greed'];
const LABELS_ZH = ['极度恐慌', '恐慌', '中性', '贪婪', '极度贪婪'];

export const FEAR_GREED_DISPLAY_STOPS = Object.freeze([0, 25, 45, 55, 75, 100]);

// Presentation only: use one integer for the reading, gauge and sentiment.
// CNN can return 44.6 / fear while its website displays 45 / neutral. Keep
// the source score/rating intact; these are the app's displayed gauge bands.
export function fearGreedDisplay(value, language = 'zh') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    return { score: null, index: -1, rating: null, label: '—' };
  }
  const score = Math.round(value);
  const index = FEAR_GREED_DISPLAY_STOPS.slice(1, -1).filter(stop => score >= stop).length;
  const rating = RATINGS[index];
  const label = String(language).toLowerCase().startsWith('en')
    ? rating.replace(/\b\w/g, letter => letter.toUpperCase()) : LABELS_ZH[index];
  return { score, index, rating, label };
}
