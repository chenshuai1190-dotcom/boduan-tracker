function errorBody(message, details = undefined) {
  const body = { error: message };
  if (details !== undefined) body.details = details;
  return body;
}

export function sendError(res, statusCode, message, details = undefined) {
  return res.status(statusCode).json(errorBody(message, details));
}
