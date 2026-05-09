const DEFAULT_LOG_CHUNK_SIZE = BigInt(9_000);
const DEFAULT_LOG_DELAY_MS = 650;
const DEFAULT_LOG_LOOKBACK_BLOCKS = BigInt(9_000);
const MAX_RETRIES = 4;
let logQueue = Promise.resolve();

type LogClient = {
  getBlockNumber: () => Promise<bigint>;
  getLogs: (args: Record<string, unknown>) => Promise<any[]>;
};

export async function getLogsInChunks<TLog = any>(
  client: LogClient,
  args: Record<string, unknown> & { fromBlock?: bigint; toBlock?: bigint | "latest" },
) {
  const latest = args.toBlock === "latest" || args.toBlock === undefined
    ? await client.getBlockNumber()
    : args.toBlock;
  const configuredStart = getConfiguredStartBlock();
  const requestedStart = args.fromBlock ?? configuredStart ?? getDefaultStartBlock(latest);
  const fromBlock = requestedStart > latest ? latest : requestedStart;
  const chunkSize = getLogChunkSize();
  const logs: any[] = [];

  for (let start = fromBlock; start <= latest; start += chunkSize + BigInt(1)) {
    const end = start + chunkSize > latest ? latest : start + chunkSize;
    const chunk = await queuedGetLogs(client, {
      ...args,
      fromBlock: start,
      toBlock: end,
    });
    logs.push(...chunk);
  }

  return logs as TLog[];
}

async function queuedGetLogs(client: LogClient, args: Record<string, unknown>) {
  const run = logQueue.then(async () => {
    await sleep(getLogDelayMs());
    return getLogsWithRetry(client, args);
  });
  logQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function getLogsWithRetry(client: LogClient, args: Record<string, unknown>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await client.getLogs(args);
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === MAX_RETRIES) break;
      await sleep(getRetryDelayMs(attempt));
    }
  }
  if (isRateLimitError(lastError)) return [];
  throw lastError;
}

function getConfiguredStartBlock() {
  const raw = process.env.ARC_DEPLOYMENT_BLOCK ?? process.env.NEXT_PUBLIC_ARC_DEPLOYMENT_BLOCK;
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  const parsed = BigInt(value);
  return parsed >= BigInt(0) ? parsed : undefined;
}

function getDefaultStartBlock(latest: bigint) {
  const lookback = getLogLookbackBlocks();
  return latest > lookback ? latest - lookback : BigInt(0);
}

function getLogChunkSize() {
  const parsed = BigInt(Number(process.env.ARC_LOG_CHUNK_SIZE ?? "9000"));
  if (parsed <= BigInt(0)) return DEFAULT_LOG_CHUNK_SIZE;
  return parsed > DEFAULT_LOG_CHUNK_SIZE ? DEFAULT_LOG_CHUNK_SIZE : parsed;
}

function getLogDelayMs() {
  const parsed = Number(process.env.ARC_LOG_REQUEST_DELAY_MS ?? "650");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_LOG_DELAY_MS;
}

function getLogLookbackBlocks() {
  const value = Number(process.env.ARC_LOG_LOOKBACK_BLOCKS ?? "9000");
  const parsed = BigInt(Number.isFinite(value) ? value : 9_000);
  return parsed > BigInt(0) ? parsed : DEFAULT_LOG_LOOKBACK_BLOCKS;
}

function getRetryDelayMs(attempt: number) {
  return getLogDelayMs() * (attempt + 2) + attempt * 500;
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || message.toLowerCase().includes("too many requests");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
