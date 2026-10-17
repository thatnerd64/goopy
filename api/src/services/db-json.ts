import { ConfigWithAdapter, JsonAdapter, JsonDB } from "node-json-db";
import path from "path";

import { CONFIG_PATH } from "../../constants";

import { AtomicFileAdapter } from "./atomic-file-adapter";

// saveOnPush enabled, writes are atomic (temp file + rename), corrupt files are
// moved aside instead of crashing the server on startup
function createDb(name: string) {
  const filename = path.join(CONFIG_PATH, `${name}.json`);
  return new JsonDB(
    new ConfigWithAdapter(
      new JsonAdapter(new AtomicFileAdapter(filename)),
      true,
      "/",
    ),
  );
}

// Queue database (cache used to avoid disk reads)
export const queueDb = createDb("queue");

// History database (indexing disabled to preserve array type at root)
export const historyDb = createDb("history");

// Sync list database
export const syncListDb = createDb("sync_list");
