import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const testDir=mkdtempSync(join(tmpdir(),'video-link-test-'));
const fakeTool=join(testDir,'yt-dlp');
writeFileSync(fakeTool, `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2), url=args.at(-1);
if(url.includes('FAILFAILFAI')){ console.error('private video');process.exit(1); }
if(args.includes('--dump-single-json')){ console.log(JSON.stringify({title:'Test link',duration:url.includes('LONGLONGLON')?601:20})); }
else{fs.writeFileSync(args[args.indexOf('-o')+1].replace('%(ext)s','mp4'),'mock media');}
`, {mode:0o700});
const port = 3284;
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString('hex');
const auth = 'Basic ' + Buffer.from('yasmin:' + password).toString('base64');
const server = spawn(process.execPath, ['.next/standalone/server.js'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1', MOCK_PROVIDERS: 'true', APP_PASSWORD: password, YT_DLP_PATH: fakeTool },
  stdio: 'ignore',
});
try {
  let ready = false;
  for (let i=0;i<80;i++) {
    try { if ((await fetch(base+'/api/health')).ok) { ready=true; break; } } catch {}
    await new Promise(r=>setTimeout(r,250));
  }
  assert(ready, 'server readiness');
  for (const [path, method] of [['/api/jobs/link','POST'],['/api/jobs','POST'],['/api/jobs/unknown','GET'],['/api/jobs/unknown/summarize','POST']]) {
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
  const postLink=body=>fetch(base+'/api/jobs/link',{method:'POST',headers:{authorization:auth,origin:base,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await postLink({url:'https://youtu.be/abcdefghijk'})).status,400);
  assert.equal((await postLink({url:'https://localhost/secret',rightsConfirmed:true})).status,400);
  assert.equal((await postLink({url:'x'.repeat(5000),rightsConfirmed:true})).status,413);
  for(const [id,expected] of [['abcdefghijk','done'],['FAILFAILFAI','failed'],['LONGLONGLON','failed']]){
    const response=await postLink({url:'https://youtu.be/'+id,rightsConfirmed:true});assert.equal(response.status,202);
    const {jobId}=await response.json();let result;
    for(let i=0;i<80;i++){result=await (await fetch(base+'/api/jobs/'+jobId,{headers:{authorization:auth}})).json();if(result.status!=='running')break;await new Promise(r=>setTimeout(r,250));}
    assert.equal(result.status,expected,id);
    if(expected==='failed'){assert.equal(result.transcript,null);assert.equal(result.usage.audioSeconds,null);assert.equal(result.steps.find(s=>s.name==='transcribe').state,'skipped');}
    else assert(result.summary);
    // Cleanup completes just after the final status changes.
    for(let i=0;i<20&&existsSync(join(tmpdir(),'video-insight',jobId));i++)await new Promise(r=>setTimeout(r,50));
    assert.equal(existsSync(join(tmpdir(),'video-insight',jobId)),false);
  }
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
} finally { server.kill('SIGTERM'); rmSync(testDir,{recursive:true,force:true}); }
