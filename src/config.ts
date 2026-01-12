/**
 * Configuration module for Jetpack
 */

export interface Config {
  appName: string;
  version: string;
}

const config: Config = {
  appName: "Jetpack",
  version: "1.0.0",
};

export default config;

export function getConfig(): Config {
  return config;
}
