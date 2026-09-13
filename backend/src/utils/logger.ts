/** Minimal structured console logger. Swap for pino/winston later if needed. */

type Meta = unknown;

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string, meta?: Meta) {
    // eslint-disable-next-line no-console
    console.log(`[${ts()}] INFO  ${message}`, meta ?? '');
  },
  warn(message: string, meta?: Meta) {
    // eslint-disable-next-line no-console
    console.warn(`[${ts()}] WARN  ${message}`, meta ?? '');
  },
  error(message: string, meta?: Meta) {
    // eslint-disable-next-line no-console
    console.error(`[${ts()}] ERROR ${message}`, meta ?? '');
  },
};
