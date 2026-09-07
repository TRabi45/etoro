import { createHash, timingSafeEqual } from "node:crypto";

/** Header accepted only by server-side operators to start paid monitoring work. */
export const OPERATOR_SECRET_HEADER = "x-ma-operator-secret";

export type OperatorAuthorization =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 503;
      code: "operator_unauthorized" | "operator_secret_unconfigured";
    };

/**
 * The slice of the environment this module reads.
 *
 * Deliberately narrower than `NodeJS.ProcessEnv`: that type requires
 * `NODE_ENV`, which would force every caller - a test most of all - to
 * assemble a whole environment just to set one key.
 */
export type OperatorEnv = Readonly<Record<string, string | undefined>>;

/**
 * Protects expensive execution endpoints. A public dashboard may read data,
 * but it must never become a way to spend the model budget. The secret is
 * deliberately server-only.
 *
 * Both sides are hashed before comparison so the comparison is constant time
 * over a fixed width. Comparing the raw bytes would have to reject a
 * length mismatch first, which turns the endpoint into an oracle for the
 * secret's length.
 */
export function authorizeOperatorRequest(
  request: Request,
  env: OperatorEnv = process.env,
): OperatorAuthorization {
  const configured = env.MA_OPERATOR_SECRET?.trim();
  if (!configured) {
    return { ok: false, status: 503, code: "operator_secret_unconfigured" };
  }

  const supplied = request.headers.get(OPERATOR_SECRET_HEADER);
  if (!supplied) {
    return { ok: false, status: 401, code: "operator_unauthorized" };
  }

  const digest = (value: string): Buffer => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(configured), digest(supplied))) {
    return { ok: false, status: 401, code: "operator_unauthorized" };
  }

  return { ok: true };
}
