export const FAILURE_CLASSES = {
  AUTH: 'auth',
  PERMISSION: 'permission',
  RATE_LIMIT: 'rate_limit',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  MODEL_UNSUPPORTED: 'model_unsupported',
  MODEL_CONFIG: 'model_config',
  TIMEOUT: 'timeout',
  ABORTED: 'aborted',
  NETWORK: 'network',
  PARSE: 'parse',
  SCHEMA: 'schema',
  QUALITY: 'quality',
  EXPORT: 'export',
  UNKNOWN: 'unknown',
};

function statusFromMessage(message = '') {
  const bracket = String(message).match(/\[(\d{3})\]\s*$/);
  if (bracket) return Number(bracket[1]);
  const loose = String(message).match(/\b(?:status|code|api error)[:\s]+(\d{3})\b/i);
  return loose ? Number(loose[1]) : null;
}

function normalizedMessage(error) {
  return String(error?.message || error || '').trim();
}

export function classifyError(error, context = {}) {
  const message = normalizedMessage(error);
  const lower = message.toLowerCase();
  const statusCode = Number(error?.status || error?.statusCode || context.status || statusFromMessage(message)) || null;
  const name = String(error?.name || '').toLowerCase();

  if (name === 'aborterror' || lower.includes('aborted')) {
    return {
      failureClass: FAILURE_CLASSES.ABORTED,
      statusCode,
      retryable: false,
      userMessage: 'The request was stopped.',
    };
  }

  if (statusCode === 401) {
    return {
      failureClass: FAILURE_CLASSES.AUTH,
      statusCode,
      retryable: false,
      userMessage: 'The API key was rejected.',
    };
  }

  if (statusCode === 403) {
    return {
      failureClass: FAILURE_CLASSES.PERMISSION,
      statusCode,
      retryable: false,
      userMessage: 'The selected key does not have access to this model or API.',
    };
  }

  if (statusCode === 404) {
    return {
      failureClass: FAILURE_CLASSES.MODEL_UNSUPPORTED,
      statusCode,
      retryable: false,
      userMessage: 'The selected model endpoint was not found.',
    };
  }

  if (statusCode === 400) {
    return {
      failureClass: /temperature|top_p|max[_\s-]?tokens|schema|json/i.test(message)
        ? FAILURE_CLASSES.MODEL_CONFIG
        : FAILURE_CLASSES.UNKNOWN,
      statusCode,
      retryable: false,
      userMessage: 'The provider rejected this request.',
    };
  }

  if (statusCode === 429 || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      failureClass: FAILURE_CLASSES.RATE_LIMIT,
      statusCode,
      retryable: true,
      userMessage: 'The provider rate limit or quota was hit.',
    };
  }

  if ([408, 504].includes(statusCode) || lower.includes('timeout') || lower.includes('timed out')) {
    return {
      failureClass: FAILURE_CLASSES.TIMEOUT,
      statusCode,
      retryable: true,
      userMessage: 'The request timed out.',
    };
  }

  if ([500, 502, 503, 529].includes(statusCode) || lower.includes('overloaded') || lower.includes('unavailable')) {
    return {
      failureClass: FAILURE_CLASSES.PROVIDER_UNAVAILABLE,
      statusCode,
      retryable: true,
      userMessage: 'The provider service is temporarily unavailable.',
    };
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('econnreset') ||
    lower.includes('socket hang up')
  ) {
    return {
      failureClass: FAILURE_CLASSES.NETWORK,
      statusCode,
      retryable: true,
      userMessage: 'The network request failed.',
    };
  }

  if (lower.includes('parse') || lower.includes('no-json') || lower.includes('could not be parsed')) {
    return {
      failureClass: FAILURE_CLASSES.PARSE,
      statusCode,
      retryable: true,
      userMessage: 'The model response could not be parsed.',
    };
  }

  if (lower.includes('schema') || lower.includes('validation')) {
    return {
      failureClass: FAILURE_CLASSES.SCHEMA,
      statusCode,
      retryable: true,
      userMessage: 'The response did not match the expected schema.',
    };
  }

  if (
    lower.includes('readiness') ||
    lower.includes('quality') ||
    lower.includes('coverage') ||
    /course map generation stopped at \d+ of \d+ lessons/.test(lower)
  ) {
    return {
      failureClass: FAILURE_CLASSES.QUALITY,
      statusCode,
      retryable: true,
      userMessage: 'The generated content did not pass quality checks.',
    };
  }

  return {
    failureClass: FAILURE_CLASSES.UNKNOWN,
    statusCode,
    retryable: false,
    userMessage: message || 'The request failed.',
  };
}

export function toClassifiedError(error, context = {}) {
  const classification = classifyError(error, context);
  const wrapped = error instanceof Error ? error : new Error(String(error || classification.userMessage));
  wrapped.classification = classification;
  wrapped.failureClass = classification.failureClass;
  wrapped.statusCode = classification.statusCode;
  wrapped.retryable = classification.retryable;
  wrapped.userMessage = classification.userMessage;
  return wrapped;
}

export function failureEventFields(error, context = {}) {
  const classification = error?.classification || classifyError(error, context);
  return {
    failureClass: classification.failureClass,
    statusCode: classification.statusCode || '',
    retryable: classification.retryable,
    userMessage: classification.userMessage,
    provider: context.provider || error?.provider || '',
    modelId: context.modelId || error?.modelId || '',
  };
}
