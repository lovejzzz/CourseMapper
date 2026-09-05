// Lightweight product identity for setup and routing surfaces. Keep this leaf
// separate from publicScionProvider's semantic compiler so the landing page
// does not download the full admission implementation merely to render the
// provider name and model option.
import { APP_VERSION } from './appVersion.js';
import { SCION_BROWSER_GEMMA4_GGUF } from './scionBrowserConstants.js';
import { SCION_HOSTED_ENABLED, SCION_HOSTED_MODEL_ID, isHostedScionModel } from './scionHostedPolicy.js';

export const PUBLIC_SCION_PROVIDER_ID = 'public';
export const PUBLIC_SCION_MODEL_ID = 'scion-public';
export const PUBLIC_SCION_MODEL_NAME = `Scion V${APP_VERSION}`;
export const PUBLIC_SCION_BACKING_MODEL = SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.modelId;
export const PUBLIC_SCION_MAX_COMPLETION_TOKENS = 2400;

/** Scion is the sole public model identity. Internal evidence engines are not choices. */
export function publicScionProviderModelOptions() {
  if (!SCION_HOSTED_ENABLED) return [publicScionModelOption()];
  return [
    publicScionModelOption(),
    {
      ...publicScionModelOption(),
      id: SCION_HOSTED_MODEL_ID,
      name: 'Scion · Online Gemma 4 31B (shared free)',
      source: 'hosted-free',
      maxOutputTokens: 4096,
    },
  ];
}

/** Resolve every public or legacy stored model id to the current Scion release. */
export function publicScionModelOptionById(modelId) {
  return publicScionProviderModelOptions()[SCION_HOSTED_ENABLED && isHostedScionModel(modelId) ? 1 : 0];
}

export function publicScionModelOption() {
  return {
    id: PUBLIC_SCION_MODEL_ID,
    name: PUBLIC_SCION_MODEL_NAME,
    created: 1,
    maxInputTokens: 8192,
    maxOutputTokens: PUBLIC_SCION_MAX_COMPLETION_TOKENS,
    source: 'browser-local',
    capabilities: {
      jsonMode: false,
      jsonSchema: false,
      toolCalling: false,
      streaming: true,
      temperature: true,
    },
  };
}
