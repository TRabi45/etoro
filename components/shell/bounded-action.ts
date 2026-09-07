/**
 * How a refused expensive action should be reported.
 *
 * Both bounded controls - the global `Run intelligence` and a company refresh -
 * call endpoints that refuse for the same set of reasons, so the reasons are
 * classified once here rather than twice in two components that would drift.
 *
 * The distinction that matters is **retryable or not**, and it cannot be read
 * off the HTTP status alone. `authorizeOperatorRequest` returns 503 for an
 * unconfigured operator secret, and the AI check returns 503 for a missing
 * model key: both are server configuration facts that no amount of retrying
 * will change, and both would otherwise land in the generic 5xx branch and be
 * offered a "Try again" button that is guaranteed to fail. So the error *code*
 * decides, and the status is only a fallback for a response that carries none.
 *
 * Offering a retry that cannot work is worse than offering none: it invites the
 * reader to keep clicking, and it disguises a configuration problem as a
 * transient one.
 */

export interface ActionRefusal {
  title: string;
  message: string;
  retryable: boolean;
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

/** What the action is called, so the copy reads naturally for either control. */
export type ActionKind = "run" | "refresh";

export function classifyFailure(
  response: Response,
  body: ErrorBody | null,
  kind: ActionKind,
): ActionRefusal {
  const code = body?.error?.code;
  const serverMessage = body?.error?.message;
  const noun = kind === "run" ? "Runs are" : "Refreshes are";

  // Configuration. The server is missing a credential; the reader cannot fix
  // that from here, and retrying will fail identically every time.
  if (code === "operator_secret_unconfigured") {
    return {
      title: `${noun} disabled on this deployment`,
      message:
        serverMessage ??
        "This action needs an internal operator credential that is not configured on the server.",
      retryable: false,
    };
  }

  if (code === "ai_not_configured") {
    return {
      title: "No model is configured",
      message:
        serverMessage ??
        "Extraction needs a model provider, which is not configured on the server. Nothing was fetched.",
      retryable: false,
    };
  }

  // Authorisation. The credential exists but this caller did not present it.
  if (code === "operator_unauthorized" || response.status === 401 || response.status === 403) {
    return {
      title: "Not authorised to start this",
      message: serverMessage ?? "This endpoint requires internal operator authorization.",
      retryable: false,
    };
  }

  // Throttled. Retrying is pointless until the window passes, so the wait is
  // stated instead of a button being offered.
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const minutes = retryAfter ? Math.max(1, Math.ceil(Number(retryAfter) / 60)) : null;
    return {
      title: kind === "run" ? "A run started recently" : "A research pass ran recently",
      message: minutes
        ? `${noun} rate limited to protect the source budget. Try again in about ${minutes} minute${
            minutes === 1 ? "" : "s"
          }.`
        : `${noun} rate limited to protect the source budget. Try again shortly.`,
      retryable: false,
    };
  }

  // A malformed request is a defect in this UI, not something to retry into.
  if (response.status === 400) {
    return {
      title: "The request was rejected",
      message:
        serverMessage ??
        "The server could not read the request. Nothing was fetched and no data changed.",
      retryable: false,
    };
  }

  // Everything else: a genuine failure that may not recur.
  return {
    title: kind === "run" ? "The run could not start" : "The refresh could not start",
    message:
      serverMessage ?? "The server rejected the request. Nothing was fetched and no data changed.",
    retryable: true,
  };
}

/** The same shape for a request that never reached the server at all. */
export function unreachableFailure(kind: ActionKind): ActionRefusal {
  return {
    title: kind === "run" ? "The run could not be reached" : "The refresh could not be reached",
    message:
      "The request never completed, so it is unknown whether any sources were fetched. Check Monitoring before starting another one.",
    retryable: true,
  };
}
