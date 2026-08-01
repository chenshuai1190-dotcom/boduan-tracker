import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';
import { fetchQuoteForSymbol } from '../server/quote/providerHandlers.js';
import { fetchMarketMovers } from '../server/quote/marketMovers.js';
import { providerForSymbol, QUOTE_PROVIDER } from '../server/quote/providers.js';
import { createQuoteResponse } from '../server/quote/response.js';
import { parseSymbolsParam } from '../server/quote/symbols.js';
import { fetchStockFundamentals } from '../server/quote/fundamentals.js';
import { fetchStockValuation } from '../server/quote/valuation.js';
import {
  QUOTE_API_POLICY_HEADER,
  QUOTE_API_POLICY_VERSION,
} from '../src/lib/quoteApiPolicy.js';

function hasCurrentQuoteApiPolicy(req) {
  const headers = req?.headers || {};
  const value = headers[QUOTE_API_POLICY_HEADER.toLowerCase()]
    ?? headers[QUOTE_API_POLICY_HEADER]
    ?? (typeof req?.getHeader === 'function' ? req.getHeader(QUOTE_API_POLICY_HEADER) : '');
  return String(value || '').trim() === QUOTE_API_POLICY_VERSION;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  const authRequired = process.env.QUOTE_API_AUTH_REQUIRED !== 'false';
  if (authRequired) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  // Keep the public unauthenticated boundary stable without making a network
  // request. A stale client that does present a bearer token is rejected by
  // the rollout marker below before token verification or provider access.
  if (authRequired && !String(req?.headers?.authorization || '').startsWith('Bearer ')) {
    return sendError(res, 401, '未授权: 请先登录后再请求行情接口');
  }

  // This public, non-secret rollout marker is deliberately checked before
  // authentication and provider setup. Old cached clients therefore cannot
  // keep consuming REST quota after a quote-policy rollout.
  if (!hasCurrentQuoteApiPolicy(req)) {
    res.setHeader('Upgrade', `${QUOTE_API_POLICY_HEADER}/${QUOTE_API_POLICY_VERSION}`);
    return sendError(res, 426, '行情客户端版本已过期，请刷新或重新打开应用');
  }

  const auth = await requireQuoteAuth(req, res);
  if (!auth.ok) return;

  const { symbols, view } = req.query;
  const requestedView = Array.isArray(view) ? view[0] : view;
  const marketMoversRequested = requestedView === 'market-movers';
  const stockDetailRequested = requestedView === 'stock-detail';
  const fundamentalsRequested = requestedView === 'fundamentals';
  const valuationRequested = requestedView === 'valuation';
  if (
    view !== undefined
    && !marketMoversRequested
    && !stockDetailRequested
    && !fundamentalsRequested
    && !valuationRequested
  ) {
    return sendError(res, 400, '不支持的 view 参数');
  }

  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (marketMoversRequested) {
    if (!eodhdKey) {
      return sendError(res, 500, 'API key 未配置,请在 Vercel 环境变量里设置 EODHD_API_KEY');
    }
    try {
      return res.status(200).json(await fetchMarketMovers({ eodhdKey }));
    } catch {
      return sendError(res, 502, '美股收盘榜暂不可用');
    }
  }

  const parsed = parseSymbolsParam(symbols);
  if (parsed.error) return sendError(res, 400, parsed.error);
  if ((stockDetailRequested || fundamentalsRequested || valuationRequested) && (
    parsed.symbolList.length !== 1
    || providerForSymbol(parsed.symbolList[0]) !== QUOTE_PROVIDER.STOCK
  )) {
    return sendError(res, 400, `${requestedView} 仅支持单只普通美股`);
  }

  if (!eodhdKey) {
    return sendError(res, 500, 'API key 未配置,请在 Vercel 环境变量里设置 EODHD_API_KEY');
  }

  if (fundamentalsRequested) {
    try {
      const data = await fetchStockFundamentals(parsed.symbolList[0], { eodhdKey });
      return res.status(200).json({ success: true, data });
    } catch {
      return sendError(res, 502, '股票基本面暂不可用');
    }
  }

  if (valuationRequested) {
    try {
      const data = await fetchStockValuation(parsed.symbolList[0], { eodhdKey });
      return res.status(200).json({ success: true, data });
    } catch {
      return sendError(res, 502, '股票估值暂不可用');
    }
  }

  try {
    const results = await Promise.all(
      parsed.symbolList.map(symbol => fetchQuoteForSymbol(symbol, {
        eodhdKey,
        includeStockDetail: stockDetailRequested,
      }))
    );

    return res.status(200).json(createQuoteResponse(results));
  } catch (e) {
    return sendError(res, 500, e.message);
  }
}
