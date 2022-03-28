# mo-oauth-cli

## cli usage:

```
npx mo-oauth-cli \
  --config ./client_secret_something.json \
  --scope https://www.googleapis.com/auth/spreadsheets.readonly \
  --write-token .token.json
```

## api usage:

```
import * as oauthcli from 'mo-oauth-cli';

const config: oauthcli.Config = {
  "client_id": "..",
  "client_secret": "...",
  "auth_url": "https://accounts.google.com/o/oauth2/auth",
  "token_url": "https://oauth2.googleapis.com/token",
  "redirect_url": "http://localhost:8000/",
};

const token = await oauthcli.getToken(config, {
  scope: args.scope,
  openBrowser: true,
  readCodeFromConsole: false,
});

console.log(token.access_token);
```
