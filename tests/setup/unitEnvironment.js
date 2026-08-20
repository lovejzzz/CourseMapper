function removeUnconfiguredNodeStorage(name) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  if (
    typeof descriptor?.get !== 'function' ||
    !/internal\/webstorage/.test(Function.prototype.toString.call(descriptor.get))
  ) {
    return;
  }

  // Do not invoke Node's experimental getter: without --localstorage-file it
  // emits a warning before throwing. Delete only Node's internal lazy getter;
  // browser-like test environments keep their own storage implementation.
  delete globalThis[name];
}

removeUnconfiguredNodeStorage('localStorage');
removeUnconfiguredNodeStorage('sessionStorage');
