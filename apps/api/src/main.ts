import { buildServer } from './server.js';
import { API_DEFAULT_HOST, parseApiPort } from './config.js';

const server = buildServer({ logger: true });

async function start(): Promise<void> {
  try {
    const port = parseApiPort(process.env.API_PORT);
    // Safe development default. Binding 0.0.0.0 is an explicit future deployment decision.
    await server.listen({ host: API_DEFAULT_HOST, port });
  } catch (error) {
    server.log.error(error, 'Unable to start SmartPOS API');
    process.exitCode = 1;
    await server.close();
  }
}

void start();
