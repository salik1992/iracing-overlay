import { loadConfig } from "./config.js";
import { attachSource, Hub } from "./hub.js";
import { createOverlayServer, listen } from "./http.js";
import { openSource } from "./sources/select.js";
import { widgets } from "./widgets.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env, process.platform);
  const source = openSource(config.source);
  const hub = new Hub(widgets);
  attachSource(hub, source);
  const app = createOverlayServer({ hub, widgets, sourceName: config.source });

  let port: number;
  try {
    port = await listen(app.http, config.port, config.host);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  try {
    await source.start();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await app.close();
    process.exitCode = 1;
    return;
  }

  console.log(`iRacing overlay server on http://${config.host}:${port} (${config.source})`);
  for (const widget of widgets) {
    console.log(`  ${widget.route}  ${widget.hz} Hz`);
  }

  let closing = false;
  const shutdown = (): void => {
    if (closing) {
      return;
    }
    closing = true;
    void source.stop().then(() => app.close()).then(() => {
      process.exit(0);
    }).catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
