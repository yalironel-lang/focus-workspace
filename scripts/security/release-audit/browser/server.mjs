import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
export const server=await createServer({root,configFile:false,envDir:false,publicDir:false,
  cacheDir:join(tmpdir(),'zikuk-offline-browser-vite'),
  server:{host:'127.0.0.1',port:4179,strictPort:true,cors:false,hmr:false,
    fs:{allow:[join(root,'src'),join(root,'node_modules'),join(root,'scripts/security/release-audit/browser')],
      deny:['**/.env*','**/.git/**','**/.vercel*/**','**/scratch/**','**/g285/**']}}});
await server.listen();
