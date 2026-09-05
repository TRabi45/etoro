import { config as loadEnv } from "dotenv";

/**
 * Loads local credentials for the integration suite.
 *
 * Previously every integration file called `dotenv` itself, which worked until a
 * new file forgot to - and the failure mode is misleading: nine tests fail with
 * "Supabase is not configured", which reads like a broken environment rather
 * than a missing import. Doing it once, here, makes it impossible to forget.
 *
 * `.env.local` first so it wins over anything already in `.env`.
 */
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });
