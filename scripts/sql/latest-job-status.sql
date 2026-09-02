-- Local/remote operator snapshots: one indexed lookup per known job.
-- Do not replace this with row_number() or GROUP BY across the job history.
WITH expected_jobs(job_name) AS (
	VALUES ('email_outbox'), ('telegram_outbox'), ('price_review'),
		('document_quarantine'), ('funding_authorization_expiry'),
		('email_reservation_cleanup'), ('privacy_r2_cleanup'),
		('security_metadata_cleanup'), ('storage_orphan_cleanup')
), latest AS MATERIALIZED (
	SELECT (
		SELECT status FROM scheduled_job_runs AS run
		WHERE run.job_name = expected_jobs.job_name
		ORDER BY run.started_at DESC, run.id DESC LIMIT 1
	) AS status FROM expected_jobs
)
SELECT COUNT(status) AS latest_jobs,
	COALESCE(SUM(status IN ('succeeded', 'feature_disabled')), 0) AS latest_jobs_healthy
FROM latest;
