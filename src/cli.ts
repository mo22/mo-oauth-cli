import yargs from 'yargs';
import * as oauthcli from './index';

(async () => {
  const args = await yargs
    .option('config', { type: 'string' })
    .argv;

  const config = await oauthcli.loadJsonConfig(args.config);
  console.log(config);

})().catch((err) => {
  console.error(err);
  process.exit(1);
});
