function abortError() {
  const error = new Error('任务已取消');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

module.exports = { abortError, throwIfAborted };
