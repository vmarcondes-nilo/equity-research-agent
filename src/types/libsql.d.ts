// Type declaration for @libsql/client (transitive dependency from @mastra/libsql)
declare module '@libsql/client' {
  export interface Client {
    execute(sql: string | { sql: string; args?: unknown[] }): Promise<{ rows: Record<string, unknown>[] }>;
    batch(statements: { sql: string; args?: unknown[] }[]): Promise<void>;
    close(): void;
  }

  export interface Config {
    url: string;
    authToken?: string;
  }

  export function createClient(config: Config): Client;
}
