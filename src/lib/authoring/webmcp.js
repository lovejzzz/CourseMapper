import { authoringFlags } from './featureFlags.js';
import { tools, clone, lessonSchema, AuthoringError } from '../authoringCore/core.js';
import { failure } from '../authoringCore/service.js';
// One registration owner per Document; StrictMode remounts and HMR update its
// service reference. Unregistering does not pretend to cancel executing writes.
const KEY = Symbol.for('coursemapper.authoring.webmcp');
export function registerPageTools({ document, getContext }) {
  if (!authoringFlags.pageTools) return () => {};
  const host = document?.modelContext;
  if (!host?.registerTool || document.defaultView?.top !== document.defaultView) return () => {};
  let state = document[KEY];
  if (state) {
    state.getContext = getContext;
    state.owners++;
  } else {
    state = { getContext, owners: 1, names: [], disposed: false };
    document[KEY] = state;
    state.ready = (async () => {
      for (const tool of tools.filter((t) => t.channels.includes('webmcp'))) {
        const schema = clone(tool.inputSchema);
        if (schema.properties?.bundle) {
          schema.properties.bundle = clone(lessonSchema);
          delete schema.properties.bundle.$id;
          schema.$defs = clone(lessonSchema.$defs);
        }
        if (tool.webmcp.requireDocumentEpoch) {
          schema.properties.documentEpoch = { type: 'string' };
          schema.required = [...schema.required, 'documentEpoch'];
        }
        await host.registerTool({
          name: tool.name,
          description: tool.description,
          inputSchema: schema,
          annotations: tool.webmcp.annotations,
          execute: async (args, options = {}) => {
            if (state.disposed || !state.owners)
              return failure(new AuthoringError('PAGE_ACCESS_REQUIRED', 'Page tool registration is no longer active.'));
            const ctx = state.getContext();
            if (tool.webmcp.requireDocumentEpoch && (!ctx.principal || args.documentEpoch !== ctx.epoch))
              return failure(
                new AuthoringError(
                  'PAGE_ACCESS_REQUIRED',
                  'Allow access in the page and use its current document epoch.',
                ),
              );
            const { documentEpoch: _epoch, ...input } = args;
            const result = await ctx.service.execute(tool.name, input, ctx.principal, {
              ...options,
              isCurrent: () => {
                const latest = state.getContext();
                return (
                  !state.disposed &&
                  state.owners > 0 &&
                  latest.epoch === ctx.epoch &&
                  latest.principal?.uid === ctx.principal?.uid &&
                  !!latest.principal
                );
              },
            });
            if (tool.name.endsWith('get_capabilities') && ctx.principal) result.data.documentEpoch = ctx.epoch;
            ctx.onChange?.();
            return result;
          },
        });
        state.names.push(tool.name);
      }
    })().catch((error) => {
      state.error = error;
    });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.owners--;
    queueMicrotask(async () => {
      if (state.owners) return;
      await state.ready;
      if (state.owners) return;
      state.disposed = true;
      for (const name of state.names) host.unregisterTool(name);
      if (document[KEY] === state) delete document[KEY];
    });
  };
}
