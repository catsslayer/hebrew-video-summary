import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const moduleExports = {};
const authEnv = { NODE_ENV: 'production' };
runInNewContext(ts.transpileModule(readFileSync('lib/server-access.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: moduleExports, require: createRequire(import.meta.url), process: { env: authEnv }, Buffer, Response, URL });
assert.equal(moduleExports.requireAccess(new Request('https://example.test')).status,503);
authEnv.APP_PASSWORD = 'short';
assert.equal(moduleExports.requireAccess(new Request('https://example.test')).status,503);

const port = 3284;
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString('hex');
const auth = 'Basic ' + Buffer.from('yasmin:' + password).toString('base64');
const server = spawn(process.execPath, ['.next/standalone/server.js'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1', MOCK_PROVIDERS: 'true', APP_PASSWORD: password },
  stdio: 'ignore',
});
try {
  let ready = false;
  for (let i=0;i<80;i++) {
    try { if ((await fetch(base+'/api/health')).ok) { ready=true; break; } } catch {}
    await new Promise(r=>setTimeout(r,250));
  }
  assert(ready, 'server readiness');
  for (const [path, method] of [['/api/jobs','POST'],['/api/jobs/unknown','GET'],['/api/jobs/unknown/summarize','POST']]) {
    assert.equal((await fetch(base+path,{method})).status,401, path);
    assert.equal((await fetch(base+path,{method,headers:{authorization:'Basic invalid'}})).status,401,path+' wrong password');
  }
  assert.equal((await fetch(base,{redirect:'manual'})).status,307);
  const loginPage = await fetch(base+'/login'); assert.equal(loginPage.status,200); assert.equal(loginPage.headers.get('www-authenticate'),null);
  assert.equal((await fetch(base,{headers:{authorization:auth}})).status,200);
  const wrong=await fetch(base+'/api/login',{method:'POST',headers:{origin:base},body:new URLSearchParams({username:'yasmin',password:'wrong'}),redirect:'manual'});
  assert.equal(wrong.headers.get('location'),'/login?error=1'); assert.equal(wrong.headers.get('set-cookie'),null);
  const login=await fetch(base+'/api/login',{method:'POST',headers:{origin:base},body:new URLSearchParams({username:'yasmin',password}),redirect:'manual'});
  assert.equal(login.status,303); const cookie=login.headers.get('set-cookie'); assert(cookie.includes('HttpOnly')); assert(cookie.includes('Secure'));
  const sessionCookie=cookie.split(';')[0];
  assert.equal((await fetch(base,{headers:{cookie:sessionCookie}})).status,200);
  assert.equal((await fetch(base+'/api/jobs/unknown',{headers:{cookie:sessionCookie}})).status,404);
  assert.equal((await fetch(base+'/api/jobs/unknown',{headers:{cookie:sessionCookie+'broken'}})).status,401);

  assert.equal((await fetch(base+'/api/jobs',{method:'POST',headers:{authorization:auth,origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(base+'/api/jobs',{method:'POST',headers:{authorization:auth}})).status,403);
  const form = new FormData();
  form.append('file',new Blob(['mock fixture'],{type:'video/mp4'}),'mock.mp4');
  const uploaded = await fetch(base+'/api/jobs',{method:'POST',headers:{authorization:auth,origin:base},body:form});
  assert.equal(uploaded.status,202);
  const {jobId} = await uploaded.json();
  let job;
  for (let i=0;i<80;i++) {
    job = await (await fetch(base+'/api/jobs/'+jobId,{headers:{authorization:auth}})).json();
    if (job.status!=='running') break;
    await new Promise(r=>setTimeout(r,250));
  }
  assert.equal(job.status,'done'); assert.equal(job.mock,true); assert(job.summary);
  assert.equal((await fetch(base+'/api/jobs/'+jobId+'/summarize',{method:'POST',headers:{authorization:auth,origin:base}})).status,409);
  console.log('PASS production auth, protected APIs, cross-site blocking, mock pipeline, duplicate retry blocking. No paid calls.');
} finally { server.kill('SIGTERM'); }
