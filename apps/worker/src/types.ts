export interface Env {
  DB: D1Database;
  AUTH_CODE?: string;
  SERVER_ORIGIN_URL?: string;
  PLATFORM_URL?: string;
  FEED_MODE?: string;
  UPDATE_DELAY_TIME?: string;
  ENABLE_CLEAN_HTML?: string;
  FEED_CRON?: string;
  ACCOUNT_CHECK_CRON?: string;
  ACCOUNT_CHECK_WEBHOOK_URL?: string;
}
