export function scopedDeleteByField(tableQuery, field, value, userId) {
  if (!userId) throw new Error('未登录');
  return tableQuery
    .delete()
    .eq(field, value)
    .eq('user_id', userId);
}

export function scopedDeleteById(tableQuery, id, userId) {
  return scopedDeleteByField(tableQuery, 'id', id, userId);
}

export function scopedDeleteBySymbol(tableQuery, symbol, userId) {
  return scopedDeleteByField(tableQuery, 'symbol', symbol, userId);
}
