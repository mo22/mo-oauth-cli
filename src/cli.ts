import yargs from 'yargs';
import * as oauthcli from './index';

(async () => {
  const args = await yargs
    .option('config', { type: 'string', description: 'path to oauth config file' })
    .option('scope', { type: 'string', array: true, description: 'set the scope' })
    .option('open-browser', { type: 'boolean', default: true, description: 'automatically open browser' })
    .option('read-code-from-console', { type: 'boolean', default: false, description: 'read the oauth code from console instead of spawing http server' })
    .option('write-token', { type: 'string', description: 'write oauth token to json file' })
    .argv;

  const config = await oauthcli.loadJsonConfig(args.config);
  const token = await oauthcli.getToken(config, {
    scope: args.scope,
    openBrowser: args.openBrowser,
    readCode: args.readCodeFromConsole ? 'console' : 'webserver',
    cachePath: args.writeToken,
  });
  if (!args.writeToken) {
    console.log(token);
  }

})().catch((err) => {
  console.error(err);
  process.exit(1);
});
