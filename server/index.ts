import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { readConfig } from './config.ts';
import { Store } from './database.ts';

process.umask(0o077);
const config = readConfig();
const store = new Store(config.databasePath);
const server = createApp(store, config, {
  staticDirectory: process.env.STATIC_DIRECTORY ? resolve(process.env.STATIC_DIRECTORY) : undefined,
});
server.listen(config.port, config.host, () => console.log(`Wedding API listening on ${config.host}:${config.port}`));
server.on('error', () => {
  console.error('Unable to start wedding API. Check the configured host and port.');
  store.close();
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => { server.closeAllConnections(); }, 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
