import fs from "fs";
import path from "path";
import toml from "toml";

import { CONFIG_PATH } from "../../constants";
import { getAppInstance } from "../helpers/app-instance";
import { get_tiddl_config } from "../helpers/get_tiddl_config";

const TOML_CONFIG_PATH = `${CONFIG_PATH}/.tiddl/config.toml`;

/**
 * Read the config TOML file content
 * @returns An object containing the TOML content
 */
export function getTomlConfig(): { toml: string } {
  try {
    if (fs.existsSync(TOML_CONFIG_PATH)) {
      return { toml: fs.readFileSync(TOML_CONFIG_PATH, "utf-8") };
    }
    return { toml: "" };
  } catch (error) {
    console.error("❌ [TOML] Error reading .tiddl/config.toml:", error);
    return { toml: "" };
  }
}

/**
 * Returns a human readable parse error, or null when the TOML is valid.
 */
export function validateToml(content: string): string | null {
  try {
    toml.parse(content);
    return null;
  } catch (error) {
    const err = error as Error & { line?: number; column?: number };
    const position = err.line
      ? ` (line ${err.line}, column ${err.column})`
      : "";
    return `${err.message}${position}`;
  }
}

/**
 * Write TOML content to the config TOML file
 * @param content - The TOML content to write
 */
export async function setTomlConfig(content: string): Promise<void> {
  try {
    // Ensure the shared directory exists
    const sharedDir = path.dirname(TOML_CONFIG_PATH);
    if (!fs.existsSync(sharedDir)) {
      fs.mkdirSync(sharedDir, { recursive: true });
    }

    fs.writeFileSync(TOML_CONFIG_PATH, content, "utf-8");

    // Update app.locals with fresh config
    const app = getAppInstance();
    const refreshed = get_tiddl_config();
    app.locals.tiddlConfig = refreshed.config;
  } catch (error) {
    console.error("❌ [TOML] Error writing .tiddl/config.toml:", error);
    throw error;
  }
}
