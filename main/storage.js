const stores = ['settings', 'workouts', 'routines'];
const legacyKey = 'setmark.web.v1';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('setmark', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('settings');
      db.createObjectStore('workouts', {keyPath:'id'});
      db.createObjectStore('routines', {keyPath:'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 세트마크 창을 닫은 뒤 다시 시도해 주세요.'));
  });
}

function complete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('저장이 중단됐어요.'));
  });
}

function migrate(db) {
  const transaction = db.transaction(stores, 'readwrite');
  const done = complete(transaction);
  const settings = transaction.objectStore('settings');
  let migrationError;
  const request = settings.get('profile');
  request.onsuccess = () => {
    if (request.result !== undefined) return;
    try {
      const raw = localStorage.getItem(legacyKey);
      const {workouts = [], routines = [], ...profile} = raw === null ? {} : JSON.parse(raw);
      for (const [table, records] of [['workouts', workouts], ['routines', routines]]) {
        const store = transaction.objectStore(table);
        if (!Array.isArray(records)) throw new Error('기존 기록의 저장 형식을 확인해 주세요.');
        for (const record of records) store.add(record);
      }
      settings.add(profile, 'profile');
    } catch (error) {
      migrationError = error;
      transaction.abort();
    }
  };
  return done.catch(error => { throw migrationError ?? error; });
}

export async function openStorage() {
  const db = await openDatabase();
  try {
    await migrate(db);
    const transaction = db.transaction(stores);
    const done = complete(transaction);
    const profile = transaction.objectStore('settings').get('profile');
    const workouts = transaction.objectStore('workouts').getAll();
    const routines = transaction.objectStore('routines').getAll();
    await done;
    return {
      data: {...profile.result, workouts:workouts.result, routines:routines.result},
      async save(profile, changes = {}) {
        const tables = Object.keys(changes);
        const write = db.transaction(['settings', ...tables], 'readwrite');
        const saved = complete(write);
        try {
          write.objectStore('settings').put(profile,'profile');
          for (const table of tables) {
            const store = write.objectStore(table);
            for (const record of changes[table].put ?? []) store.put(record);
            for (const id of changes[table].remove ?? []) store.delete(id);
          }
        } catch {
          write.abort();
        }
        await saved;
      }
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
