PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- Stage 13 adds a third, explicitly non-production template scope.  These
-- bundles use the real Browser Rendering path, but remain internally approved,
-- visibly watermarked preview material and can never satisfy a production gate.
DROP TRIGGER contract_template_versions_approved_immutable;
DROP TRIGGER contract_offers_insert_scope_guard;
DROP TRIGGER contract_artifacts_reject_delete;

-- DROP TABLE performs an implicit delete.  D1 therefore requires the two
-- direct child tables to be empty while the CHECK-constrained parent is
-- rebuilt.  Grandchild FK checks are deferred and every child row is restored
-- byte-for-byte before the transaction can commit.
CREATE TABLE contract_offers_0024_backup AS SELECT * FROM contract_offers;
CREATE TABLE contract_artifacts_0024_backup AS SELECT * FROM contract_artifacts;
DELETE FROM contract_artifacts;
DELETE FROM contract_offers;

CREATE TABLE contract_template_versions_next (
	id TEXT PRIMARY KEY NOT NULL,
	template_id TEXT NOT NULL
		CHECK (template_id IN ('group_yearly', 'group_monthly', 'individual_hourly', 'nachhilfe_hourly')),
	template_version TEXT NOT NULL,
	render_schema_version TEXT NOT NULL,
	clause_set_version TEXT NOT NULL,
	provider_version_id TEXT NOT NULL REFERENCES contract_provider_versions(id),
	media_contact_version_id TEXT REFERENCES media_withdrawal_contact_versions(id),
	template_bundle_r2_key TEXT NOT NULL UNIQUE,
	bundle_hash TEXT NOT NULL
		CHECK (length(bundle_hash) = 64 AND bundle_hash NOT GLOB '*[^0-9a-f]*'),
	html_source_hash TEXT NOT NULL
		CHECK (length(html_source_hash) = 64 AND html_source_hash NOT GLOB '*[^0-9a-f]*'),
	css_source_hash TEXT NOT NULL
		CHECK (length(css_source_hash) = 64 AND css_source_hash NOT GLOB '*[^0-9a-f]*'),
	asset_manifest_json TEXT NOT NULL
		CHECK (json_valid(asset_manifest_json) AND json_type(asset_manifest_json) = 'object'),
	font_manifest_json TEXT NOT NULL
		CHECK (json_valid(font_manifest_json) AND json_type(font_manifest_json) = 'object'),
	required_fields_json TEXT NOT NULL
		CHECK (json_valid(required_fields_json) AND json_type(required_fields_json) = 'array'),
	renderer_id TEXT NOT NULL
		CHECK (renderer_id IN ('synthetic-test-pdf-v1', 'cloudflare-browser-run-pdf-v1')),
	renderer_contract_version TEXT NOT NULL,
	worker_compatibility_date TEXT NOT NULL,
	usage_scope TEXT NOT NULL
		CHECK (usage_scope IN ('synthetic_test', 'preview_review', 'production')),
	approval_status TEXT NOT NULL CHECK (approval_status IN ('draft', 'approved', 'retired')),
	approval_basis TEXT NOT NULL
		CHECK (approval_basis IN ('synthetic_fixture', 'internal_preview_review',
			'authorized_verein_approval', 'legal_review')),
	distance_legal_profile TEXT NOT NULL
		CHECK (distance_legal_profile IN ('offline_only', 'widerruf_applicable', 'widerruf_not_applicable_312g_2_9')),
	distance_legal_basis_version TEXT,
	distance_legal_basis_hash TEXT
		CHECK (distance_legal_basis_hash IS NULL OR (length(distance_legal_basis_hash) = 64
			AND distance_legal_basis_hash NOT GLOB '*[^0-9a-f]*')),
	kuendigung_function_required INTEGER NOT NULL DEFAULT 0
		CHECK (kuendigung_function_required IN (0, 1)),
	early_performance_supported INTEGER NOT NULL DEFAULT 0
		CHECK (early_performance_supported IN (0, 1)),
	approved_by TEXT REFERENCES users(id),
	approved_at TEXT,
	valid_from TEXT,
	valid_to TEXT,
	created_at TEXT NOT NULL,
	UNIQUE (template_id, template_version),
	CHECK (
		(usage_scope = 'synthetic_test' AND renderer_id = 'synthetic-test-pdf-v1'
			AND approval_basis = 'synthetic_fixture')
		OR (usage_scope = 'preview_review' AND renderer_id = 'cloudflare-browser-run-pdf-v1'
			AND approval_basis = 'internal_preview_review')
		OR (usage_scope = 'production' AND renderer_id = 'cloudflare-browser-run-pdf-v1'
			AND approval_basis IN ('authorized_verein_approval', 'legal_review'))
	),
	CHECK (approval_status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
	CHECK (usage_scope = 'synthetic_test' OR distance_legal_basis_hash IS NOT NULL)
);

INSERT INTO contract_template_versions_next (
	id, template_id, template_version, render_schema_version, clause_set_version,
	provider_version_id, media_contact_version_id, template_bundle_r2_key, bundle_hash,
	html_source_hash, css_source_hash, asset_manifest_json, font_manifest_json,
	required_fields_json, renderer_id, renderer_contract_version,
	worker_compatibility_date, usage_scope, approval_status, approval_basis,
	distance_legal_profile, distance_legal_basis_version, distance_legal_basis_hash,
	kuendigung_function_required, early_performance_supported, approved_by, approved_at,
	valid_from, valid_to, created_at
)
SELECT id, template_id, template_version, render_schema_version, clause_set_version,
	provider_version_id, media_contact_version_id, template_bundle_r2_key, bundle_hash,
	html_source_hash, css_source_hash, asset_manifest_json, font_manifest_json,
	required_fields_json, renderer_id, renderer_contract_version,
	worker_compatibility_date, usage_scope, approval_status, approval_basis,
	distance_legal_profile, distance_legal_basis_version, distance_legal_basis_hash,
	kuendigung_function_required, early_performance_supported, approved_by, approved_at,
	valid_from, valid_to, created_at
FROM contract_template_versions;

DROP TABLE contract_template_versions;
ALTER TABLE contract_template_versions_next RENAME TO contract_template_versions;

INSERT INTO contract_offers SELECT * FROM contract_offers_0024_backup;
INSERT INTO contract_artifacts SELECT * FROM contract_artifacts_0024_backup;
DROP TABLE contract_artifacts_0024_backup;
DROP TABLE contract_offers_0024_backup;

CREATE TRIGGER contract_template_versions_approved_immutable
BEFORE UPDATE ON contract_template_versions WHEN OLD.approval_status = 'approved'
BEGIN SELECT RAISE(ABORT, 'approved contract template version is immutable'); END;

CREATE TRIGGER contract_offers_insert_scope_guard
BEFORE INSERT ON contract_offers
BEGIN
	SELECT RAISE(ABORT, 'contract offer owner child family mismatch') WHERE NOT EXISTS (
		SELECT 1 FROM users owner JOIN children child ON child.owner_user_id = owner.id
		JOIN family_number_allocations family ON family.id = owner.family_number_id
		WHERE owner.id = NEW.user_id AND child.id = NEW.child_id
			AND owner.account_status = 'active' AND owner.is_blocked = 0
			AND child.family_number_id = owner.family_number_id
			AND NEW.family_number_id_at_issue = owner.family_number_id
			AND NEW.family_version_at_issue = owner.family_version
			AND family.status = 'assigned' AND family.owner_user_id = owner.id
	);
	SELECT RAISE(ABORT, 'contract template kind mismatch') WHERE NOT EXISTS (
		SELECT 1 FROM contract_template_versions template WHERE template.id = NEW.template_version_id
			AND template.template_id = NEW.contract_kind AND template.approval_status = 'approved'
	);
END;

CREATE TRIGGER contract_artifacts_reject_delete
BEFORE DELETE ON contract_artifacts
BEGIN SELECT RAISE(ABORT, 'contract artifacts are retained evidence'); END;

PRAGMA foreign_key_check;
