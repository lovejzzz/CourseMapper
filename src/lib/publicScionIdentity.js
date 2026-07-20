// Lightweight product identity for setup and routing surfaces. Keep this leaf
// separate from publicScionProvider's semantic compiler so the landing page
// does not download the full admission implementation merely to render the
// provider name and model option.
import { APP_VERSION } from './appVersion.js';
import { SCION_BROWSER_GEMMA4_GGUF } from './scionBrowserConstants.js';

export const PUBLIC_SCION_PROVIDER_ID = 'public';
export const PUBLIC_SCION_MODEL_ID = 'scion-public';
export const PUBLIC_SCION_MODEL_NAME = `Scion V${APP_VERSION}`;
export const PUBLIC_SCION_BACKING_MODEL = SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.modelId;
export const PUBLIC_SCION_MAX_COMPLETION_TOKENS = 2400;

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
