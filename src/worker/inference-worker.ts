import type { WorkerEvent, WorkerRequest, WorkerResponse } from '@shared/worker/protocol';
import { handle } from './handle';

// Runs inside an Electron utilityProcess. No Electron APIs, no network.
const port = process.parentPort;

let queue: Promise<void> = Promise.resolve();

function send(message: WorkerResponse | WorkerEvent) {
  port.postMessage(message);
}

port.on('message', ({ data }: { data: WorkerRequest }) => {
  queue = queue.then(async () => {
    try {
      send({ id: data.id, ok: true, result: await handle(data) });
    } catch (error) {
      send({
        id: data.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
});

process.on('uncaughtException', (error) => {
  send({ type: 'log', level: 'error', message: error.stack ?? error.message });
  process.exit(1);
});

send({ type: 'ready' });
