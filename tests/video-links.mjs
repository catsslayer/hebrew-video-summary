import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url), cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const req=id=>id==='@/lib/config'?load('lib/config.ts'):id==='./url'?load('lib/links/url.ts'):nativeRequire(id);
 runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,process,URL,Buffer,console,setTimeout,clearTimeout,setInterval,clearInterval});
 return exports;
}
const {parseVideoLink}=load('lib/links/url.ts');
const {validateMetadata}=load('lib/links/download.ts');
for(const value of ['https://youtu.be/abcdefghijk?t=5','https://www.youtube.com/watch?v=abcdefghijk&list=abc','https://youtube.com/shorts/abcdefghijk'])assert.equal(parseVideoLink(value).url,'https://www.youtube.com/watch?v=abcdefghijk');
assert.equal(parseVideoLink('https://player.vimeo.com/video/123456?h=abcdef1234').url,'https://vimeo.com/123456/abcdef1234');
for(const value of ['http://youtube.com/watch?v=abcdefghijk','https://youtube.com.evil.test/watch?v=abcdefghijk','https://localhost/1','https://169.254.169.254/','file:///etc/passwd','https://youtube.com@evil.test/','https://x:pass@youtube.com/watch?v=abcdefghijk','https://youtube.com:444/watch?v=abcdefghijk','https://youtube.com/playlist?list=x','https://vimeo.com/123/../../x','https://vimeo.com/123?h=bad',null,{},'--exec bad'])assert.throws(()=>parseVideoLink(value));
assert.equal(validateMetadata({duration:600,title:'test'}).duration,600);
for(const data of [{duration:601},{duration:0},{duration:null},{duration:NaN},{duration:Infinity},{duration:50,is_live:true},{duration:50,_type:'playlist'},{duration:50,live_status:'is_upcoming'}])assert.throws(()=>validateMetadata(data));
console.log('PASS link normalization, restricted hosts/protocols, invalid input, duration and live/playlist guards. No network or AI calls.');
