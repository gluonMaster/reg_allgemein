import { readdirSync } from 'node:fs';
import { intakeReleaseTests, outsideIntakeReleaseTests } from '../intake-release-set';

function testFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = `${directory}/${entry.name}`;
		if (entry.isDirectory()) return testFiles(path);
		return /\.(test|spec)\.(js|ts)$/.test(entry.name) ? [path] : [];
	});
}

describe('trial-intake release test set', () => {
	it('places every unit and integration test on exactly one side of the deploy gate', () => {
		const listed = [...intakeReleaseTests, ...outsideIntakeReleaseTests];
		expect(listed.filter((file, index) => listed.indexOf(file) !== index)).toEqual([]);
		const actual = [...testFiles('tests/unit'), ...testFiles('tests/integration')].sort();
		// A new test file must be added to one list in tests/intake-release-set.ts.
		expect(actual.filter((file) => !listed.includes(file))).toEqual([]);
		expect(listed.filter((file) => !actual.includes(file))).toEqual([]);
	});
});
