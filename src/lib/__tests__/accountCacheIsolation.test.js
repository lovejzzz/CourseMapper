import { accountStorageKey, setAccountStorageUser } from '../accountStorage.js';
import { getProfile, saveProfile, updateProfile } from '../professorProfile.js';
import { getCustomDeliverable, saveCustomDeliverable, deleteCustomDeliverable } from '../customDeliverableLibrary.js';
import { listDeveloperTemplates, saveDeveloperTemplate, deleteDeveloperTemplate } from '../developerTemplates.js';
import { getMemories, addMemory, updateMemory, deleteMemory } from '../agentMemory.js';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeCloudProfile } from '../professorProfile.js';
import { mergeCloudDeliverables } from '../customDeliverableLibrary.js';
import { mergeCloudDeveloperTemplates } from '../developerTemplates.js';
import { mergeCloudMemories, mergeCloudAgentPrefs } from '../agentMemory.js';
import * as cloud from '../cloudStorage.js';
vi.mock('../cloudStorage.js', () => ({
  loadProfile: vi.fn(async () => null),
  saveProfile: vi.fn(async () => {}),
  loadCustomDeliverables: vi.fn(async () => ({})),
  saveCustomDeliverable: vi.fn(async () => {}),
  deleteCustomDeliverable: vi.fn(async () => {}),
  loadDeveloperTemplates: vi.fn(async () => ({})),
  saveDeveloperTemplate: vi.fn(async () => {}),
  deleteDeveloperTemplate: vi.fn(async () => {}),
  loadAgentMemories: vi.fn(async () => [{ id: 'b', content: 'B synthetic' }]),
  saveAgentMemory: vi.fn(async () => {}),
  deleteAgentMemory: vi.fn(async () => {}),
  loadAgentPrefs: vi.fn(async () => ({ style: 'B synthetic' })),
  saveAgentPrefs: vi.fn(async () => {}),
}));
beforeEach(() => {
  vi.clearAllMocks();
  setAccountStorageUser(null);
  const values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  });
});
const sentinel = 'ACCOUNT_A_PRIVATE_SYNTHETIC';
for (const [name, key, value, merge, save] of [
  ['profile', 'coursemapper-professorProfile', { name: sentinel }, mergeCloudProfile, 'saveProfile'],
  [
    'custom definitions',
    'coursemapper-custom-deliverables',
    { a: { id: 'a', name: sentinel } },
    mergeCloudDeliverables,
    'saveCustomDeliverable',
  ],
  [
    'developer templates',
    'coursemapper-developer-templates',
    { a: { id: 'a', name: sentinel } },
    mergeCloudDeveloperTemplates,
    'saveDeveloperTemplate',
  ],
  ['memories', 'coursemapper-agent-memory', [{ id: 'a', content: sentinel }], mergeCloudMemories, 'saveAgentMemory'],
  ['preferences', 'coursemapper-agent-prefs', { privateNote: sentinel }, mergeCloudAgentPrefs, 'saveAgentPrefs'],
])
  it(name + ' must not upload the previous local account cache to B', async () => {
    localStorage.setItem(key, JSON.stringify(value));
    await merge('account-b');
    expect(JSON.stringify(cloud[save].mock.calls)).not.toContain(sentinel);
  });

afterEach(() => {
  setAccountStorageUser(null);
  vi.unstubAllGlobals();
});

it('restores each account cache and retains anonymous data without adoption', () => {
  saveProfile({ name: 'legacy' }, null);
  setAccountStorageUser('a');
  expect(getProfile().name).toBe('');
  saveProfile({ name: 'A' }, 'a');
  const def = saveCustomDeliverable({ name: 'A custom' }, 'a');
  const tpl = saveDeveloperTemplate({ name: 'A template' }, 'a');
  const mem = addMemory({ content: 'A memory', uid: 'a' });
  setAccountStorageUser('b');
  expect(getProfile().name).toBe('');
  expect(getCustomDeliverable(def.id)).toBeNull();
  expect(listDeveloperTemplates()).toEqual([]);
  expect(getMemories()).toEqual([]);
  updateProfile({ institution: 'B school' }, 'b');
  updateMemory(mem.id, { content: 'bad' }, 'b');
  deleteCustomDeliverable(def.id, 'b');
  deleteDeveloperTemplate(tpl.id, 'b');
  deleteMemory(mem.id, 'b');
  setAccountStorageUser('a');
  expect(getProfile().name).toBe('A');
  expect(getProfile().institution).toBe('');
  expect(getCustomDeliverable(def.id).name).toBe('A custom');
  expect(listDeveloperTemplates()[0].name).toBe('A template');
  expect(getMemories()[0].content).toBe('A memory');
  setAccountStorageUser(null);
  expect(getProfile().name).toBe('legacy');
});

for (const [name, key, loader, merge, value] of [
  ['profile', 'coursemapper-professorProfile', 'loadProfile', mergeCloudProfile, { profile: { name: 'A remote' } }],
  [
    'custom definitions',
    'coursemapper-custom-deliverables',
    'loadCustomDeliverables',
    mergeCloudDeliverables,
    { a: { id: 'a', name: 'A remote' } },
  ],
  [
    'developer templates',
    'coursemapper-developer-templates',
    'loadDeveloperTemplates',
    mergeCloudDeveloperTemplates,
    { a: { id: 'a', name: 'A remote' } },
  ],
  [
    'memories',
    'coursemapper-agent-memory',
    'loadAgentMemories',
    mergeCloudMemories,
    [{ id: 'a', content: 'A remote' }],
  ],
  ['preferences', 'coursemapper-agent-prefs', 'loadAgentPrefs', mergeCloudAgentPrefs, { style: 'A remote' }],
])
  it(name + ' keeps a delayed A response in A after switching to B', async () => {
    let resolve;
    cloud[loader].mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    setAccountStorageUser('a');
    const pending = merge('a');
    // Preferences dynamically import the cloud module before loading.
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    setAccountStorageUser('b');
    const bKey = accountStorageKey(key);
    localStorage.setItem(bKey, JSON.stringify({ sentinel: 'B local' }));
    resolve(value);
    await pending;
    expect(localStorage.getItem(bKey)).toBe(JSON.stringify({ sentinel: 'B local' }));
    expect(localStorage.getItem(accountStorageKey(key, 'a'))).toContain('A remote');
    expect(JSON.stringify(cloud.saveProfile.mock.calls.filter((c) => c[0] === 'b'))).not.toContain('A remote');
  });
