import { defineConfig } from 'vitest/config';
import base from './vitest.config';
import { intakeReleaseTests } from './tests/intake-release-set';

// The trial-intake deploy gate: only tests of code that PORTAL_MODE=trial_intake executes.
export default defineConfig({
	...base,
	test: { ...base.test, include: intakeReleaseTests },
});
