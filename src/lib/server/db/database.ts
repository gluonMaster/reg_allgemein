export interface StatementSpec {
	sql: string;
	params?: readonly unknown[];
}

export interface SqlDatabaseBoundary {
	run<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>>;
	first<T = Record<string, unknown>>(statement: StatementSpec): Promise<T | null>;
	all<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>>;
	batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]>;
}

export class DatabaseBoundary implements SqlDatabaseBoundary {
	constructor(private readonly database: D1Database) {}

	prepare(statement: StatementSpec): D1PreparedStatement {
		const prepared = this.database.prepare(statement.sql);
		return statement.params?.length ? prepared.bind(...statement.params) : prepared;
	}

	run<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>> {
		return this.prepare(statement).run<T>();
	}

	first<T = Record<string, unknown>>(statement: StatementSpec): Promise<T | null> {
		return this.prepare(statement).first<T>();
	}

	all<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>> {
		return this.prepare(statement).all<T>();
	}

	batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		return this.database.batch<T>(statements.map((statement) => this.prepare(statement)));
	}
}
