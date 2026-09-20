import { doc, getDoc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { hash, assert } from '../authoringCore/primitives.js';
const versions = new Map();
const tails = new Map();
export function cloudVersionForResume(uid, pid) {
  const version = uid && pid && versions.get(`${uid}/${pid}`);
  return version ? { uid, projectId: pid, ...version } : null;
}
export function restoreCloudVersionForResume(uid, pid, saved) {
  if (
    !uid ||
    !pid ||
    saved?.uid !== uid ||
    saved?.projectId !== pid ||
    !Number.isSafeInteger(saved.revision) ||
    saved.revision < 0 ||
    !(saved.updatedAt === null || Number.isFinite(saved.updatedAt))
  )
    return false;
  versions.set(`${uid}/${pid}`, { revision: saved.revision, updatedAt: saved.updatedAt });
  return true;
}
export function rememberCloudVersion(uid, pid, data) {
  versions.set(`${uid}/${pid}`, {
    revision: data.authoringRevision || 0,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
  });
}
export async function loadAuthoredCloudProject(db, uid, pid, root) {
  assert(root.authoringManifest?.blocks?.length, 'MISSING_CONTENT', 'The author-content manifest is missing.');
  const parts = await Promise.all(
    root.authoringManifest.blocks.map(async (block) => {
      assert(/^[a-f0-9]{64}$/.test(block), 'MISSING_CONTENT', 'Invalid content block ID.');
      const snap = await getDoc(doc(db, 'users', uid, 'projects', pid, 'authoringBlocks', block));
      assert(
        snap.exists() && typeof snap.data().text === 'string',
        'MISSING_CONTENT',
        'A saved author-content block is missing.',
      );
      assert(
        (await hash(snap.data().text)) === block,
        'CORRUPT_CONTENT',
        'A saved content block failed its integrity check.',
      );
      return snap.data().text;
    }),
  );
  const text = parts.join('');
  assert(
    (await hash(text)) === root.authoringManifest.hash,
    'CORRUPT_CONTENT',
    'The saved project failed its integrity check.',
  );
  return { ...JSON.parse(text), authoringRevision: root.authoringRevision, projectId: pid };
}
export function saveAuthoredCloudProject(db, uid, pid, snapshot) {
  const key = `${uid}/${pid}`;
  const work = (tails.get(key) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const text = JSON.stringify(snapshot);
      assert(
        new TextEncoder().encode(text).length <= 20 * 1024 * 1024,
        'PAYLOAD_TOO_LARGE',
        'Save this large project as a file.',
      );
      const blocks = [];
      // 120k UTF-16 units <= 480k UTF-8 bytes, safely below Firestore's limit.
      for (let offset = 0; offset < text.length; ) {
        let end = Math.min(text.length, offset + 120000);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        const part = text.slice(offset, end);
        offset = end;
        const block = await hash(part);
        blocks.push(block);
        const ref = doc(db, 'users', uid, 'projects', pid, 'authoringBlocks', block);
        if (!(await getDoc(ref)).exists()) await setDoc(ref, { text: part });
      }
      const manifest = { blocks, hash: await hash(text) };
      const expected = versions.get(key);
      const root = doc(db, 'users', uid, 'projects', pid);
      const revision = await runTransaction(db, async (tx) => {
        const snap = await tx.get(root);
        const current = snap.exists() ? snap.data() : null;
        assert(
          !current ||
            (expected &&
              (current.authoringRevision || 0) === expected.revision &&
              (current.authoringRevision || (current.updatedAt?.toMillis?.() ?? null) === expected.updatedAt)),
          'CLOUD_CONFLICT',
          'The cloud project changed on another device. Open its latest version or save a separate copy.',
        );
        const nextRevision = (current?.authoringRevision || 0) + 1;
        tx.set(root, {
          courseName: snapshot.courseMap?.courseName || snapshot.courseName || 'Untitled',
          semester: snapshot.courseMap?.semester || '',
          requiredCapabilities: ['authored-content-v2'],
          authoringRevision: nextRevision,
          authoringManifest: manifest,
          updatedAt: serverTimestamp(),
          createdAt: current?.createdAt || serverTimestamp(),
          formatVersion: 3,
        });
        return nextRevision;
      });
      versions.set(key, { revision, updatedAt: null });
      return revision;
    });
  tails.set(key, work);
  return work;
}
