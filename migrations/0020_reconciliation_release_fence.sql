PRAGMA foreign_keys = ON;

-- Promotion is the serialization point for the reconciliation release gate.
-- The application preflight remains useful for operator feedback, while this
-- trigger closes the interval between that read and the atomic promotion batch.
CREATE TRIGGER legacy_version_promotion_events_reconciliation_gate
BEFORE INSERT ON legacy_version_promotion_events
WHEN NEW.action = 'promote' AND EXISTS (
	SELECT 1
	FROM legacy_reconciliation_cases AS reconciliation_case
	WHERE reconciliation_case.academic_period_id = NEW.academic_period_id
		AND reconciliation_case.blocks_release = 1
		AND reconciliation_case.state NOT IN ('resolved', 'superseded')
)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation release gate blocked');
END;
