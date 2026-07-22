import { describe, expect, it } from 'vitest';
import {
	assertBootstrapDatabaseId,
	assertBootstrapCliTargetOptions,
	assertBootstrapConfigPath,
	assertBootstrapTargetEnvironment,
	expectedBootstrapAppEnvironment,
	expectedBootstrapConfirmation,
	parseBootstrapEnvironment,
	parseBootstrapOptions,
} from '$lib/server/auth/admin-bootstrap-command';

describe('first-admin bootstrap command boundary', () => {
	it('maps CLI environments to the exact bound APP_ENV', () => {
		expect(expectedBootstrapAppEnvironment('local')).toBe('development');
		expect(expectedBootstrapAppEnvironment('preview')).toBe('preview');
		expect(expectedBootstrapAppEnvironment('production')).toBe('production');
		expect(() => assertBootstrapTargetEnvironment('local', 'development')).not.toThrow();
		expect(() => assertBootstrapTargetEnvironment('preview', 'preview')).not.toThrow();
		expect(() => assertBootstrapTargetEnvironment('production', 'production')).not.toThrow();
	});

	it('fails closed when the selected config binds another environment', () => {
		expect(() => assertBootstrapTargetEnvironment('preview', 'production')).toThrow(
			'CLI_ENVIRONMENT_TARGET_MISMATCH'
		);
		expect(() => assertBootstrapTargetEnvironment('production', undefined)).toThrow(
			'CLI_ENVIRONMENT_TARGET_MISMATCH'
		);
	});

	it('rejects unknown, duplicate, missing-value, and valued flag arguments', () => {
		expect(() => parseBootstrapOptions(['--unknown'])).toThrow('CLI_ARGUMENT_UNKNOWN');
		expect(() => parseBootstrapOptions(['--reason', 'first', '--reason', 'second'])).toThrow(
			'CLI_ARGUMENT_DUPLICATE'
		);
		expect(() => parseBootstrapOptions(['--reason'])).toThrow('CLI_ARGUMENT_VALUE_REQUIRED');
		expect(() => parseBootstrapOptions(['--remote', 'yes'])).toThrow(
			'CLI_FLAG_VALUE_FORBIDDEN'
		);
	});

	it('accepts only the three explicit environment names', () => {
		expect(parseBootstrapEnvironment(undefined)).toBe('local');
		expect(() => parseBootstrapEnvironment('staging')).toThrow('CLI_ENVIRONMENT_INVALID');
		expect(() => parseBootstrapEnvironment(true)).toThrow('CLI_ENVIRONMENT_INVALID');
	});

	it('rejects ambiguous local target switches and requires explicit remote intent', () => {
		expect(() =>
			assertBootstrapCliTargetOptions('local', new Map([['config', 'preview.toml']]))
		).toThrow('CLI_LOCAL_TARGET_OPTIONS_FORBIDDEN');
		expect(() => assertBootstrapCliTargetOptions('preview', new Map())).toThrow(
			'CLI_REMOTE_CONFIRMATION_REQUIRED'
		);
		expect(() =>
			assertBootstrapCliTargetOptions(
				'production',
				new Map<string, string | true>([
					['remote', true],
					['config', 'production.toml'],
					['database-id', '12345678-1234-1234-1234-123456789abc'],
				])
			)
		).not.toThrow();
	});

	it('pins remote confirmation to a normalized exact D1 database ID', () => {
		const databaseId = '12345678-ABCD-1234-ABCD-123456789ABC';
		expect(assertBootstrapDatabaseId(databaseId)).toBe(databaseId.toLowerCase());
		expect(expectedBootstrapConfirmation('local')).toBe('BOOTSTRAP_FIRST_ADMIN_LOCAL');
		expect(expectedBootstrapConfirmation('preview', databaseId)).toBe(
			'BOOTSTRAP_FIRST_ADMIN_PREVIEW_12345678-abcd-1234-abcd-123456789abc'
		);
		expect(() => assertBootstrapDatabaseId('preview-db')).toThrow('CLI_DATABASE_ID_INVALID');
	});

	it('forbids the tracked placeholder config regardless of relative spelling', () => {
		expect(() => assertBootstrapConfigPath('wrangler.example.toml')).toThrow(
			'CLI_EXAMPLE_CONFIG_FORBIDDEN'
		);
		expect(() => assertBootstrapConfigPath('.\\wrangler.example.toml')).toThrow(
			'CLI_EXAMPLE_CONFIG_FORBIDDEN'
		);
		expect(() => assertBootstrapConfigPath('configs/production.toml')).not.toThrow();
	});
});
