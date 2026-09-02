-- Local/remote operator snapshot: exactly two fixed-cardinality cadence rows.
-- Do not replace this with a scan of retained scheduled_job_runs history.
SELECT COUNT(*) AS cadence_count,
	COALESCE(SUM(status = 'succeeded'), 0) AS healthy_cadences,
	COALESCE(SUM(status = 'running'), 0) AS running_cadences,
	COALESCE(SUM(status = 'failed'), 0) AS failed_cadences
FROM scheduled_cadence_state;
