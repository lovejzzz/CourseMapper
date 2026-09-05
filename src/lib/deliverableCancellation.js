export function abortDeliverableControllers(controllers, featureId = null, operationId = null) {
  if (!(controllers instanceof Map)) return 0;
  let aborted = 0;
  for (const [key, controller] of controllers) {
    if (featureId && key !== featureId && !key.startsWith(`${featureId}:`)) continue;
    if (operationId && !key.includes(`:${operationId}:`)) continue;
    controller.abort();
    controllers.delete(key);
    aborted += 1;
  }
  return aborted;
}

export function abortDeliverableOperationControllers(controllers, operationId) {
  if (!(controllers instanceof Map) || !operationId) return 0;
  let aborted = 0;
  for (const [key, controller] of controllers) {
    if (!key.includes(`:${operationId}:`)) continue;
    controller.abort();
    controllers.delete(key);
    aborted += 1;
  }
  return aborted;
}

export function releaseDeliverableController(controllers, key, controller) {
  if (controllers.get(key) !== controller) return false;
  controllers.delete(key);
  return true;
}
