import { parentPort } from 'node:worker_threads';
import type { WorkerEvent, WorkerRequest, WorkerResponse } from '@shared/worker/protocol';
import { handle } from '../worker/handle';

function requirePort() {
  if (!parentPort) throw new Error('Inference worker must run as a worker thread');
  return parentPort;
}

const port = requirePort();

let queue: Promise<void> = Promise.resolve();

function send(message: WorkerResponse | WorkerEvent): void {
  port.postMessage(message);
}

port.on('message', (data: WorkerRequest) => {
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

send({ type: 'ready' });
