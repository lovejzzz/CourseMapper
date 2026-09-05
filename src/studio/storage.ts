import { CourseSchema, type Course } from './domain';

const DB_NAME = 'edutool-studio';
let opening: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('courses', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = undefined;
      reject(request.error);
    };
  });
  return opening;
}

export async function saveCourse(course: Course, expectedRevision?: number): Promise<void> {
  CourseSchema.parse(course);
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('courses', 'readwrite');
    const store = tx.objectStore('courses');
    let conflict = false;
    const current = store.get(course.id);
    current.onsuccess = () => {
      const saved = current.result as Course | undefined;
      if (
        saved &&
        (expectedRevision !== undefined ? saved.revision !== expectedRevision : saved.revision >= course.revision)
      ) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put(course);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(
        new Error(
          conflict ? 'Another tab changed this course. Reload before continuing.' : 'Saving the course failed.',
        ),
      );
  });
}

export async function listCourses(): Promise<Course[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction('courses').objectStore('courses').getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as unknown[])
          .map((c) => CourseSchema.safeParse(c))
          .flatMap((result) => (result.success ? [result.data] : []))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    request.onerror = () => reject(request.error);
  });
}

export function importCourse(json: string): Course {
  if (json.length > 10_000_000) throw new Error('Course files must be smaller than 10 MB.');
  return CourseSchema.parse(JSON.parse(json));
}
