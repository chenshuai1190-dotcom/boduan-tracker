export function createQuoteResponse(results, now = new Date()) {
  return {
    success: true,
    data: results,
    fetchedAt: now.toISOString(),
  };
}
