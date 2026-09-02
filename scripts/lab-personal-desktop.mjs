#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { startDesktop } from "./lab-desktop.mjs";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const index = process.argv.indexOf("--desktop");
  await startDesktop({
    desktop: index === -1 ? undefined : process.argv[index + 1],
    personal: true,
  });
}
