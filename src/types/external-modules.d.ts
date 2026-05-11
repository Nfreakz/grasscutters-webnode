declare module 'discord.js' {
  export const ActivityType: any;
  export const GatewayIntentBits: any;
  export class Client {
    constructor(options?: any);
    user?: any;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    login(token?: string): Promise<string>;
    destroy(): void;
  }
}

declare module 'better-sqlite3' {
  class BetterSqlite3 {
    constructor(filename: string, options?: any);
    prepare(sql: string): any;
    exec(sql: string): any;
    close(): void;
    pragma(source: string, options?: any): any;
  }
  namespace BetterSqlite3 {
    export type Database = BetterSqlite3;
  }
  export = BetterSqlite3;
}

declare module 'sql.js' {
  const initSqlJs: any;
  export default initSqlJs;
}

declare module 'ssh2-sftp-client' {
  const SftpClient: any;
  export default SftpClient;
}

interface ImportMetaEnv {
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
