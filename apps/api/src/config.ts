/** API listens only on local loopback in POS-008; no exposed network interface. */
export const API_DEFAULT_HOST = '127.0.0.1';
export const API_DEFAULT_PORT = 3001;

export function parseApiPort(value: string | undefined): number {
  if (value === undefined) return API_DEFAULT_PORT;
  if (!/^\d+$/.test(value)) throw new Error('API_PORT must be an integer between 1 and 65535');
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }
  return port;
}
