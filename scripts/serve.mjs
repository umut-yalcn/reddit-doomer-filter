import { createLocalStaticServer } from './local-static-server.mjs';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);

createLocalStaticServer({ root, portForUrl: port }).listen(port, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${port}/test/fixtures/manual.html`);
});
