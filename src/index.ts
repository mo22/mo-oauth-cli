import { fetch } from 'cross-fetch';
import * as fs from 'fs';
import * as http from 'http';
import { URL, URLSearchParams } from 'url';
import yargs from 'yargs';
import open from 'open';
import { IsString, IsUrl, validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';

// parsed oauth configuration
export class Config {
  @IsString()
  client_id!: string;
  @IsString()
  client_secret!: string;
  @IsUrl()
  auth_url!: string;
  @IsUrl()
  token_url!: string;
  @IsUrl()
  redirect_url!: string;
}

// parse json config into Config, interpreting a range of formats
export async function parseJsonConfig(json: any): Promise<Config> {
  if (json.client_id && json.client_secret) {
    const config = plainToInstance(Config, json);
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
  const url = new URL(config.auth_url);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', args?.redirect_uri ?? config.redirect_url);
  if (args?.scope !== undefined) {
    // @TODO: , or space?
    url.searchParams.set('scope', Array.isArray(args.scope) ? args.scope.join(' ') : args.scope);
  }
  url.searchParams.set('client_id', config.client_id);
  return url.toString();
}

export async function openBrowser(url: string) {
  await open(url);
}

export async function readCodeFromConsole() {
  // readline etc.
}

export function readCodeViaHttp(args?: { port?: number; timeout?: number; }) {
  return new Promise<string>((resolve, reject) => {
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const handler: http.RequestListener = (req, res) => {
      const url = new URL(`http://localhost${req.url}`);
      if (url.searchParams.get('code')) {
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
    server.listen(args?.port ?? 8080);
    const timeout = args?.timeout ?? (60 * 1000);
    timeoutHandle = setTimeout(() => {
      server.close();
      reject(new Error(`readCodeViaHttp: timeout`));
    }, timeout);
  });
}



(async () => {
  const args = await yargs
    .option('json', { type: 'string' })
    .option('client-id', { type: 'string' })
    .option('client-secret', { type: 'string' })
    .option('auth-uri', { type: 'string', default: 'https://accounts.google.com/o/oauth2/auth' })
    .option('token-uri', { type: 'string', default: 'https://oauth2.googleapis.com/token' })
    .option('redirect-uri', { type: 'string', default: 'http://localhost:8000/' })
    .option('scope', { array: true, type: 'string' })
    .option('write-to', { type: 'string' })
    .argv;

  if (args.json) {
    const buf = await fs.promises.readFile(args.json);
    const json = JSON.parse(buf.toString());
    args.clientId = json.web.client_id;
    args.clientSecret = json.web.client_secret;
    args.authUri = json.web.auth_uri;
    args.tokenUri = json.web.token_uri;
    args.redirectUri = json.web.redirect_uris?.[0];
  }

  await open('http://sindresorhus.com'); // Opens the url in the default browser

  const codePromise = new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(`http://localhost${req.url}`);
      if (url.searchParams.get('code')) {
        resolve(url.searchParams.get('code')!);
        res.writeHead(200);
        res.write('<!DOCTYPE html><html><body><h1>you can now close this</h1><script>window.close();</script></body></html>');
        res.end();
        server.close();
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(new URL(args.redirectUri).port);
    setTimeout(() => {
      server.close();
      reject(new Error(`timeout`));
    }, 1000 * 30).unref();
  });

  const authUri = args.authUri + '?' + new URLSearchParams({
    response_type: 'code',
    redirect_uri: args.redirectUri,
    scope: args.scope?.join(',') ?? '',
    client_id: args.clientId ?? '',
  }).toString();
  console.log(authUri);
  // open(authUri);
  // @TODO: auto open?

  const code = await codePromise;
  const res = await fetch(args.tokenUri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code: code,
      client_id: args.clientId!,
      client_secret: args.clientSecret!,
      redirect_uri: args.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();

  if (args.writeTo) {
    await fs.promises.writeFile(args.writeTo, JSON.stringify(json));
  } else {
    console.log(JSON.stringify(json, null, 2));
  }

  // npx ts-node test/google-auth-cli.ts --json ~/Downloads/client_secret_300730837845-07tbg3dim9vagporh3b39argcf29lnjd.apps.googleusercontent.com.json --scope https://www.googleapis.com/auth/spreadsheets.readonly --write-to .env.google-creds.json

})().catch((err) => {
  console.error(err);
  process.exit(1);
});
