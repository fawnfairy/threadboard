// Threadboard desktop shell: local SQLite + files on disk. No server, no account, no network required.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('path'), fs = require('fs'), Database = require('better-sqlite3');
if (process.env.THREADBOARD_DATA_DIR) app.setPath('userData', process.env.THREADBOARD_DATA_DIR);
const dataDir = path.join(app.getPath('userData'), 'data'), filesDir = path.join(dataDir, 'files');
const dbPath = path.join(dataDir, 'threadboard.db'), cfgPath = path.join(dataDir, 'settings.json');
fs.mkdirSync(filesDir, { recursive: true, mode: 0o700 });
process.on('unhandledRejection', e => { console.error('Unhandled rejection', e); if (process.argv.includes('--smoke-test')) app.exit(1); });
let db, win, dirty = false; const last = new Map();
const cfg = () => { try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return {}; } };
const bdir = () => cfg().backupDir || path.join(dataDir, 'backups');
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const PFX = 'Threadboard-backup-', okId = id => /^[a-z0-9]{3,16}$/.test(id);

function backups() { try { return fs.readdirSync(bdir()).filter(n => n.startsWith(PFX) && fs.existsSync(path.join(bdir(), n, 'threadboard.db'))).sort().reverse(); } catch { return []; } }
async function backupNow(dir = bdir(), keep = 0) {
  const out = path.join(dir, PFX + stamp()); fs.mkdirSync(out, { recursive: true });
  await db.backup(path.join(out, 'threadboard.db')); fs.cpSync(filesDir, path.join(out, 'files'), { recursive: true });
  if (keep) backups().slice(keep).forEach(n => fs.rmSync(path.join(bdir(), n), { recursive: true, force: true }));
  dirty = false; return out;
}
function openDb() {
  db = new Database(dbPath);
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') {             // recovery: keep the damaged file, restore newest backup
    db.close(); fs.renameSync(dbPath, dbPath + '.damaged-' + Date.now());
    const b = backups()[0]; if (b) fs.copyFileSync(path.join(bdir(), b, 'threadboard.db'), dbPath);
    db = new Database(dbPath);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, pos INTEGER, name TEXT, created INTEGER, modified INTEGER, data TEXT);
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, name TEXT, type TEXT, size INTEGER, mod INTEGER, added INTEGER);`);
}
function load() {
  const m = db.prepare("SELECT v FROM kv WHERE k='root'").get(); if (!m) return null;
  const R = JSON.parse(m.v);
  R.list = db.prepare('SELECT id,pos,data FROM workspaces ORDER BY pos').all().map(r => { last.set(r.id, r.pos + '|' + r.data); return JSON.parse(r.data); });
  return JSON.stringify(R);
}
function save(j) {
  const R = JSON.parse(j), list = R.list; delete R.list;
  db.transaction(() => {
    const up = db.prepare(`INSERT INTO workspaces(id,pos,name,created,modified,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      pos=excluded.pos,name=excluded.name,created=excluded.created,modified=excluded.modified,data=excluded.data`);
    list.forEach((w, i) => { const d = JSON.stringify(w), k = i + '|' + d; if (last.get(w.id) !== k) { up.run(w.id, i, w.name, w.created || 0, w.mod || 0, d); last.set(w.id, k); } });
    const ids = new Set(list.map(w => w.id));
    db.prepare('SELECT id FROM workspaces').all().filter(r => !ids.has(r.id)).forEach(r => { db.prepare('DELETE FROM workspaces WHERE id=?').run(r.id); last.delete(r.id); });
    db.prepare("INSERT OR REPLACE INTO kv VALUES('root',?)").run(JSON.stringify(R));
  })(); dirty = true;
}
function restore() {
  const r = dialog.showOpenDialogSync(win, { title: 'Choose a Threadboard backup folder', defaultPath: bdir(), properties: ['openDirectory'] });
  if (!r) return; const src = r[0];
  if (!fs.existsSync(path.join(src, 'threadboard.db'))) return dialog.showErrorBox('Not a backup', 'That folder has no threadboard.db inside.');
  if (dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['Restore', 'Cancel'], defaultId: 1, message: 'Replace current data with this backup?', detail: 'A safety copy of your current data is made first.' })) return;
  backupNow(path.join(dataDir, 'pre-restore')).then(() => {
    db.close(); fs.copyFileSync(path.join(src, 'threadboard.db'), dbPath);
    if (fs.existsSync(path.join(src, 'files'))) fs.cpSync(path.join(src, 'files'), filesDir, { recursive: true, force: true });
    app.relaunch(); app.exit(0);
  });
}
function menu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'File', submenu: [
      { label: 'Back Up Now…', click: async () => { const o = await backupNow(); dialog.showMessageBox(win, { message: 'Backup saved', detail: o }); } },
      { label: 'Restore From Backup…', click: restore },
      { label: 'Choose Backup Folder…', click: () => { const r = dialog.showOpenDialogSync(win, { properties: ['openDirectory', 'createDirectory'] }); if (r) fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg(), backupDir: r[0] })); } },
      { label: 'Show Data Folder', click: () => shell.openPath(dataDir) }, { type: 'separator' }, { role: 'close' } ] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' } ]));
}
app.whenReady().then(() => {
  openDb(); menu();
  // YouTube's embedded player expects apps to identify themselves with a Referer; a file:// page sends none (error 153).
  // This placeholder URL should be changed to a page you control.
  const YT_REFERER = 'https://threadboard.local/';
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'] },
    (det, cb) => { det.requestHeaders['Referer'] = YT_REFERER; cb({ requestHeaders: det.requestHeaders }); });
  ipcMain.on('tb:load', e => { try { e.returnValue = load(); } catch (x) { console.error(x); e.returnValue = null; } });
  ipcMain.on('tb:save', (e, j) => { try { save(j); } catch (x) { console.error(x); } });
  ipcMain.on('tb:saveSync', (e, j) => { try { save(j); e.returnValue = 1; } catch { e.returnValue = 0; } });
  ipcMain.handle('tb:filePut', (e, id, m, buf) => {
    if (!okId(id)) return false; fs.writeFileSync(path.join(filesDir, id), Buffer.from(buf), { mode: 0o600 });
    db.prepare('INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?)').run(id, m.name || 'file', m.type || '', buf.byteLength, m.mod || Date.now(), Date.now()); return true; });
  ipcMain.handle('tb:fileGet', (e, id) => {
    const r = okId(id) && db.prepare('SELECT * FROM files WHERE id=?').get(id), p = path.join(filesDir, id || '');
    return r && fs.existsSync(p) ? { meta: { name: r.name, type: r.type, mod: r.mod }, bytes: fs.readFileSync(p) } : null; });
  ipcMain.handle('tb:lib', (e, n) => /^pdf(\.worker)?\.min\.mjs$/.test(n) ? fs.readFileSync(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', n), 'utf8') : null);
  ipcMain.handle('tb:fileDel', (e, id) => { if (!okId(id)) return false; fs.rmSync(path.join(filesDir, id), { force: true }); db.prepare('DELETE FROM files WHERE id=?').run(id); return true; });
  win = new BrowserWindow({ width: 1320, height: 840, minWidth: 760, minHeight: 520, title: 'Threadboard', backgroundColor: '#e9edf2',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, u) => { if (!u.startsWith('file://')) { e.preventDefault(); if (/^https?:/.test(u)) shell.openExternal(u); } });

  if (process.argv.includes('--smoke-test')) win.webContents.once('did-finish-load', async () => {
    try {
      const r = await win.webContents.executeJavaScript(`(async()=>{const o={bridge:typeof window.tb==='object'};
        const n=newNote(40,40,false,'Smoke');o.created=!!N[n.id];
        const f=new File([new Uint8Array([1,2,3])],'smoke.bin',{type:'application/octet-stream'});
        o.filePut=(await idb('put','smoke123',f))==='smoke123';const g=await idb('get','smoke123');o.fileGet=!!g&&g.size===3;save();return o})()`);
      await new Promise(x => setTimeout(x, 900));
      const c = db.prepare('SELECT COUNT(*) c FROM workspaces').get().c;
      const ok = r.bridge && r.created && r.filePut && r.fileGet && c >= 1 && fs.existsSync(path.join(filesDir, 'smoke123'));
      console.log('SMOKE ' + JSON.stringify({ ...r, workspaces: c, dbPath, ok })); app.exit(ok ? 0 : 1);
    } catch (e) { console.log('SMOKE FAIL ' + e); app.exit(1); }
  });
  setInterval(() => { if (dirty) backupNow(bdir(), 10).catch(console.error); }, 15 * 60 * 1000);
});
app.on('before-quit', () => { try { if (dirty) { db.pragma('wal_checkpoint(TRUNCATE)'); } } catch {} });
app.on('window-all-closed', () => app.quit());
