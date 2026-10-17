import { readFileSync } from "fs";
import toml from "toml";

import { CONFIG_PATH } from "../../constants";
import { PublicTiddlConfig, TiddlConfig } from "../types";

export function get_tiddl_config(): {
  config: TiddlConfig;
  errors: string[];
} {
  const tiddlDir = `${CONFIG_PATH}/.tiddl`;
  const errors: string[] = [];

  // Read config.toml
  let config;
  try {
    const configPath = `${tiddlDir}/config.toml`;
    const configContent = readFileSync(configPath, "utf-8");
    config = toml.parse(configContent);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("⚠️ [TIDDL] There is an issue with the config file.");
    console.log(`⚠️ [TIDDL] Error: ${error}`);
    errors.push(`Config file error: ${errorMessage}`);
  }

  // Read auth.json
  let auth;
  try {
    const authPath = `${tiddlDir}/auth.json`;
    const authContent = readFileSync(authPath, "utf-8");
    auth = JSON.parse(authContent);
  } catch {
    console.log("⚠️ [TIDDL] No auth file found.");
  }

  // Merge config and auth into TiddlConfig structure
  return {
    config: {
      ...config,
      auth: auth,
    } as TiddlConfig,
    errors,
  };
}

/**
 * The tiddl config as sent to the browser: the Tidal access and refresh tokens
 * never leave the server (the web interface goes through /proxy/tidal), only
 * the account fields the interface needs are kept.
 */
export function toPublicTiddlConfig(
  config: TiddlConfig | undefined,
): PublicTiddlConfig | undefined {
  if (!config) return config;
  const { auth, ...rest } = config;
  return {
    ...rest,
    auth: auth
      ? {
          user_id: auth.user_id,
          country_code: auth.country_code,
          expires_at: auth.expires_at,
        }
      : undefined,
  };
}
