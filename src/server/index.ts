import { loadConfig } from './config';
import { createServer } from './http';
import { SpeechService } from './speech';

const config = loadConfig();
const speech = new SpeechService(config);
const server = createServer(config, speech);

server.listen(config.port, config.host, () => {
  const local = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`Inaudio web is on http://${local}:${config.port}`);
  if (config.password) console.log('Password protection is on.');
  else console.log('No password is set. Anyone who can reach this address can use it.');
});

void speech.start().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
});

const shutdown = () => {
  server.close();
  void speech.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
