import { fetch } from 'cross-fetch';
import * as fs from 'fs';
import * as http from 'http';
import { URL, URLSearchParams } from 'url';
import open from 'open';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUrl, validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import * as readline from 'readline';

// parsed oauth configuration
export class Config {
  @IsString()
  client_id!: string;
  @IsString()
  client_secret!: string;
  @IsUrl({ require_tld: false })
  auth_url!: string;
  @IsUrl({ require_tld: false })
  token_url!: string;
  @IsUrl({ require_tld: false })
  redirect_url!: string;
  @IsString({ each: true }) @IsArray() @IsOptional()
  scope?: string[];
}

// oauth token
export class Token {
  @IsString()
  access_token!: string;
  @IsString()
  client_id!: string;
  @IsInt() @IsOptional()
  expires_in?: number;
  @IsInt() @IsOptional()
  expires_at?: number;
  @IsString() @IsOptional()
  scope?: string;
  @IsString() @IsEnum(['Bearer'])
  token_type!: 'Bearer';
  // @TODO: refresh_token handling?
}

// parse json config into Config, interpreting a range of formats
export async function parseJsonConfig(json: any): Promise<Config> {
  if (json.client_id && json.client_secret) {
    const config = plainToInstance(Config, {
      ...json,
    });
    await validateOrReject(config);
    return config;
  } else if (json?.web?.client_id) {
    // google style
    const config = plainToInstance(Config, {
      ...json.web,
      redirect_url: json.web.redirect_uris[0],
      auth_url: json.web.auth_uri,
      token_url: json.web.token_uri,
    });
    await validateOrReject(config);
    return config;
  } else {
    throw new Error(`invalid oauth config`);
  }
}

export async function loadJsonConfig(path: string): Promise<Config> {
  const json = JSON.parse((await fs.promises.readFile(path)).toString());
  return await parseJsonConfig(json);
}

export function getCodeAuthUrl(config: Config, args?: { scope?: string | string[]; redirect_uri?: string; }): string {
  let scope = config.scope ? config.scope.join(' ') : undefined;
  if (scope === undefined && args.scope !== undefined) {
    scope = Array.isArray(args.scope) ? args.scope.join(' ') : args.scope;
  }
  const url = new URL(config.auth_url);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', args?.redirect_uri ?? config.redirect_url);
  if (scope !== undefined) url.searchParams.set('scope', scope);
  url.searchParams.set('state', 'mo-oauth-cli:' + config.client_id);
  url.searchParams.set('client_id', config.client_id);
  return url.toString();
}

export async function openBrowser(url: string) {
  await open(url);
}

export async function readCodeFromConsole(args?: { prompt?: string; }) {
  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(args?.prompt ?? 'oauth code: ', (answer) => {
      resolve(answer);
      rl.close();
    });
  });
}

export function readCodeViaHttp(config: Config, args?: { port?: number; timeout?: number; }) {
  return new Promise<string>((resolve, reject) => {
    const port = args?.port ?? new URL(config.redirect_url).port ?? 8000;
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const handler: http.RequestListener = (req, res) => {
      const url = new URL(`http://localhost${req.url}`);
      if (url.searchParams.get('code')) {
        // verify state?
        resolve(url.searchParams.get('code')!);
        res.writeHead(200);
        res.write('<!DOCTYPE html><html><body><h1>you can now close this</h1><script>window.close();</script></body></html>');
        res.end();
        clearTimeout(timeoutHandle);
        server.close();
        return;
      }
      res.writeHead(404).end();
    };
    const server = http.createServer(handler);
    server.listen(port);
    const timeout = args?.timeout ?? (60 * 1000);
    timeoutHandle = setTimeout(() => {
      server.close();
      reject(new Error(`readCodeViaHttp: timeout`));
    }, timeout);
  });
}

export async function getTokenFromCode(config: Config, code: string): Promise<Token> {
  const res = await fetch(config.token_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code: code,
      client_id: config.client_id,
      client_secret: config.client_secret,
      redirect_uri: config.redirect_url,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!res.ok) {
    let json: any;
    try {
      json = await res.json();
    } catch (err: any) {
    }
    throw new Error(`getTokenFromCode: ${res.status} ${res.statusText}: ${json?.error} ${json?.error_description}`);
  }
  const json = await res.json();
  const token = plainToInstance(Token, {
    client_id: config.client_id,
    ...json,
    ...(json.expires_in && !json.expires_at) && { expires_at: Date.now() + json.expires_in * 1000 },
  });
  await validateOrReject(token);
  return token;
}

export async function getToken(config: Config, args: { scope?: string | string[]; openBrowser?: boolean; readCodeFromConsole?: boolean; }) {
  await validateOrReject(config);
  const authUrl = getCodeAuthUrl(config, {
    scope: args.scope,
  });
  if (args?.openBrowser === false) {
    console.log('open browser:', authUrl);
  } else {
    await openBrowser(authUrl);
  }
  let code: string;
  if (args?.readCodeFromConsole === true) {
    code = await readCodeFromConsole();
  } else {
    code = await readCodeViaHttp(config);
  }
  const token = await getTokenFromCode(config, code);
  return token;
}
