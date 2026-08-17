import { Client, type QueryResultRow } from "pg";

type D1Result<T = Record<string, unknown>> = {
  results: T[];
  success: boolean;
  meta: { changes: number };
};

class PostgresPreparedStatement {
  constructor(
    private readonly connectionString: string,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new PostgresPreparedStatement(this.connectionString, this.sql, values);
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return withClient(this.connectionString, (client) => execute<T>(client, this));
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.run<T>();
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = (await this.all<T>()).results[0];
    if (!row) return null;
    return column ? ((row as Record<string, unknown>)[column] as T ?? null) : row;
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
    const rows = (await this.all<Record<string, unknown>>()).results;
    if (!rows.length) return [];
    const names = Object.keys(rows[0]);
    const values = rows.map((row) => names.map((name) => row[name]));
    return (options?.columnNames ? [names, ...values] : values) as T[];
  }
}

export class PostgresD1Database {
  constructor(private readonly connectionString: string) {}

  prepare(sql: string) {
    return new PostgresPreparedStatement(this.connectionString, sql);
  }

  async batch<T = Record<string, unknown>>(statements: PostgresPreparedStatement[]): Promise<D1Result<T>[]> {
    return withClient(this.connectionString, async (client) => {
      await client.query("BEGIN");
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) results.push(await execute<T>(client, statement));
        await client.query("COMMIT");
        return results;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async exec(sql: string) {
    return withClient(this.connectionString, async (client) => {
      const result = await client.query(translateSql(sql));
      return { count: result.rowCount ?? 0, duration: 0 };
    });
  }
}

async function withClient<T>(connectionString: string, operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function execute<T>(client: Client, statement: PostgresPreparedStatement): Promise<D1Result<T>> {
  const result = await client.query<QueryResultRow>(translateSql(statement.sql), statement.values);
  return {
    results: result.rows.map(normaliseRow) as T[],
    success: true,
    meta: { changes: result.rowCount ?? 0 },
  };
}

function normaliseRow(row: QueryResultRow): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString().replace("T", " ").replace("Z", "") : value,
  ]));
}

export function translateSql(source: string): string {
  let parameter = 0;
  let quote: "'" | '"' | null = null;
  let output = "";
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      output += character;
      if (character === quote) {
        if (source[cursor + 1] === quote) output += source[++cursor];
        else quote = null;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      output += character;
    } else if (character === "?") {
      output += `$${++parameter}`;
    } else output += character;
  }
  return output
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO")
    .replace(/datetime\(\s*'now'\s*\)/gi, "CURRENT_TIMESTAMP")
    .replace(/date\(\s*'now'\s*\)/gi, "CURRENT_DATE");
}

