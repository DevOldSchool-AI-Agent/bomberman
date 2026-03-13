import { defineConfig } from "vite";

function resolveBasePath(): string {
  const explicitBasePath = process.env.VITE_BASE_PATH;
  if (explicitBasePath && explicitBasePath.length > 0) {
    return explicitBasePath.endsWith("/") ? explicitBasePath : `${explicitBasePath}/`;
  }

  if (process.env.GITHUB_ACTIONS === "true") {
    const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (repositoryName && repositoryName.length > 0) {
      return `/${repositoryName}/`;
    }
  }

  return "/";
}

export default defineConfig({
  base: resolveBasePath(),
  server: {
    port: 5179,
    host: true
  }
});
