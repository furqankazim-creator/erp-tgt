import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, ".env"), quiet: true });
dotenv.config({ quiet: true });

// One signing secret shared by the app login and PM Connect keys. There is no
// built-in fallback in production: a missing secret must stop the server
// rather than silently sign tokens with a value that's public in the repo.
export const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? (() => {
        throw new Error("JWT_SECRET is required when NODE_ENV=production.");
      })()
    : "dev-only-insecure-secret-do-not-use-in-production");
