/**
 * Declaraciones mínimas para dependencias JavaScript que se usan de forma
 * dinámica o no publican tipos suficientes para el checker actual.
 *
 * No añaden código al bundle ni instalan paquetes.
 */

declare module 'sql.js' {
  type SqlJsConfig = {
    locateFile?: (file: string) => string;
    [key: string]: unknown;
  };

  type SqlJsDatabase = {
    run(sql: string, params?: unknown[] | Record<string, unknown>): unknown;
    exec(sql: string, params?: unknown[] | Record<string, unknown>): unknown[];
    export(): Uint8Array;
    close(): void;
    [key: string]: unknown;
  };

  type SqlJsStatic = {
    Database: new (data?: Uint8Array | number[]) => SqlJsDatabase;
    [key: string]: unknown;
  };

  const initSqlJs: (config?: SqlJsConfig) => Promise<SqlJsStatic>;
  export default initSqlJs;
}

declare module 'ssh2-sftp-client' {
  export default class SftpClient {
    constructor(name?: string);
    connect(config: Record<string, unknown>): Promise<unknown>;
    end(): Promise<unknown>;
    get(remotePath: string, destination?: unknown): Promise<unknown>;
    put(source: unknown, remotePath: string): Promise<unknown>;
    fastGet(remotePath: string, localPath: string, options?: Record<string, unknown>): Promise<unknown>;
    fastPut(localPath: string, remotePath: string, options?: Record<string, unknown>): Promise<unknown>;
    exists(remotePath: string): Promise<false | string>;
    list(remotePath: string, pattern?: string | RegExp): Promise<unknown[]>;
    mkdir(remotePath: string, recursive?: boolean): Promise<unknown>;
    delete(remotePath: string, noErrorOnAbsent?: boolean): Promise<unknown>;
    rename(fromPath: string, toPath: string): Promise<unknown>;
    [key: string]: unknown;
  }
}
