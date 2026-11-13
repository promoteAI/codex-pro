/** Shape of one scheduled job as returned by `GET /cron`.
 *
 *  Lives on its own because the live UI (`ScheduledView`) and the run-history
 *  drawer both consume it, while the old `Cron` page that used to own it has
 *  been removed. */
export interface CronJob {
  id: string;
  name: string;
  cron_expr: string;
  enabled: boolean;
  status: string;
  last_status: string;
  next_run_ms: number | null;
  config_valid?: boolean;
  // Needed by the edit form to seed the visible fields and to detect which key
  // (`command` or `message`) this job stores its instruction under. PUT merges
  // server-side, so unknown keys no longer have to make the round trip through
  // the browser. Authorization is not in here at all: it is a first-class field
  // on ScheduledJob, and a same-named key inside payload carries no weight.
  payload?: Record<string, unknown>;
  /** Audit trail of who granted unattended execution, or null if never granted. */
  authorization?: {
    operator: string;
    source: string;
    granted_at_ms: number;
    summary: string;
  } | null;
  /** Whether that grant still applies to the job's current content. Separate
   *  from `authorization` on purpose: having one without the other is the
   *  "edited after authorizing" state. */
  authorization_valid?: boolean;
}
