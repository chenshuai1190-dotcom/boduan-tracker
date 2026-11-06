import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMMUNITY_AVATAR_MAX_BYTES, normalizeCommunityAvatarPath, isCommunityAvatarSignedUrl, validateCommunityAvatarFile, communityAvatarCropRect } from '../src/lib/communityAvatarModel.js';
import { createCommunityAvatarRepository } from '../src/lib/communityAvatarRepository.js';
import { encodeCommunityAvatar } from '../src/lib/communityAvatarImage.js';
const user = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', object = '33333333-3333-4333-8333-333333333333';
const path = `${user}/${object}.webp`, origin = 'https://example.supabase.co';
const signedUrl = `${origin}/storage/v1/object/sign/community-avatars/${path}?token=example-test-only`;
function stub({ identity = user, readResult = { data: { user_id: user, avatar_path: path }, error: null }, saveError = null } = {}) {
 const operations = [];
 const client = { auth: { getUser: async () => ({ data: { user: { id: identity } } }) }, from(table) {
  const operation = { table, filters: [] }; const query = { select(columns) { operation.columns = columns; return query; }, eq(key, value) { operation.filters.push([key, value]); return query; }, is(key, value) { operation.filters.push([key, value]); return query; }, update(payload) { operation.payload = payload; return query; }, async maybeSingle() { operations.push(operation); return operation.payload ? { data: saveError ? null : { ...operation.payload, user_id: user }, error: saveError } : readResult; } }; return query;
 }, storage: { from(bucket) { return { async upload(target, file, opts) { operations.push({ bucket, target, opts }); return {}; }, async createSignedUrl(target, seconds) { operations.push({ bucket, target, seconds }); return { data: { signedUrl } }; }, async remove(targets) { operations.push({ bucket, targets }); return {}; } }; } } };
 return { operations, repository: createCommunityAvatarRepository(client, { randomUUID: () => object, supabaseUrl: origin }) };
}
test('avatar paths and signed URLs remain owner-scoped and Supabase-origin restricted', () => {
 assert.equal(normalizeCommunityAvatarPath(path, user), path); assert.equal(normalizeCommunityAvatarPath(path, other), null);
 for (const invalid of [signedUrl, `${user}/../x.webp`, `${user}/x.webp`, path.toUpperCase()]) assert.equal(normalizeCommunityAvatarPath(invalid, user), null);
 assert.equal(isCommunityAvatarSignedUrl(signedUrl, { supabaseUrl: origin, path }), true);
 for (const invalid of [signedUrl.replace('example.supabase.co','evil.example'), signedUrl.replace('/sign/','/public/'), signedUrl.replace('?token=example-test-only','')]) assert.equal(isCommunityAvatarSignedUrl(invalid,{supabaseUrl:origin,path}),false);
});
test('input accepts bounded raster files and upload rejects oversized or executable content', () => {
 assert.doesNotThrow(() => validateCommunityAvatarFile({ type:'image/jpeg',size:9e6 },{source:true}));
 for (const file of [{type:'image/svg+xml',size:12},{type:'image/webp',size:COMMUNITY_AVATAR_MAX_BYTES+1},{type:'image/png',size:0}]) assert.throws(()=>validateCommunityAvatarFile(file));
});
test('square crop preserves image bounds at portrait, landscape and zoom edges', () => {
 assert.deepEqual(communityAvatarCropRect({width:1000,height:500}),{x:250,y:0,width:500,height:500});
 assert.deepEqual(communityAvatarCropRect({width:500,height:1000,zoom:2,x:0,y:1}),{x:0,y:750,width:250,height:250});
 assert.throws(()=>communityAvatarCropRect({width:0,height:10}));
});
test('canvas output is 512 pixels, uses crop source and falls back to JPEG when WebP is unsupported', async()=>{
 const calls=[],context={clearRect(){},drawImage(...args){calls.push(args);}};
 const canvas={getContext:()=>context,toBlob(fn,type){fn(new Blob(['pixels'],{type:type==='image/webp'?'image/png':'image/jpeg'}));}};
 const image={naturalWidth:1200,naturalHeight:800};
 const result=await encodeCommunityAvatar(image,{zoom:2,x:.5,y:.5},()=>canvas);
 assert.equal(canvas.width,512);assert.equal(canvas.height,512);assert.equal(result.type,'image/jpeg');
 assert.deepEqual(calls[0].slice(1),[400,200,400,400,0,0,512,512]);
});
test('avatar reads gracefully fall back before migration and reject another account before I/O', async()=>{
 const pending=stub({readResult:{data:null,error:{code:'42703',message:'avatar_path column missing'}}});
 assert.deepEqual(await pending.repository.read(user),{path:null,configured:false});
 const mismatch=stub({identity:other});await assert.rejects(mismatch.repository.read(user),{code:'AVATAR_ACCOUNT_CHANGED'});assert.equal(mismatch.operations.length,0);
});
test('upload uses a private owner path and resolution rejects foreign paths', async()=>{
 const s=stub();assert.deepEqual(await s.repository.upload(new Blob(['x'],{type:'image/webp'}),user),{path});
 assert.equal(s.operations[0].bucket,'community-avatars');assert.equal(s.operations[0].opts.upsert,false);
 await assert.rejects(s.repository.resolve(path,other),{code:'AVATAR_ACCOUNT_CHANGED'});
 assert.equal(await s.repository.resolve(path,user),signedUrl);assert.equal(s.operations.at(-1).seconds,600);
});
test('custom avatar save uses expected path CAS, preserves preset fallback, and stores no signed URL', async()=>{
 const s=stub();const profile=await s.repository.save({nickname:'用户昵称',avatarKey:'blue',avatarPath:path,expectedAvatarPath:null},user);
 assert.equal(profile.avatarPath,path);const op=s.operations[0];assert.deepEqual(op.filters,[['user_id',user],['avatar_path',null]]);
 assert.equal(op.payload.avatar_key,'blue');assert.equal(op.payload.avatar_path,path);assert.equal(JSON.stringify(op.payload).includes('token='),false);
});
test('uncertain profile writes preserve uploaded objects and missing schema is explicit', async()=>{
 const s=stub({saveError:{message:'network failure'}});await assert.rejects(s.repository.save({nickname:'用户昵称',avatarKey:'blue',avatarPath:path,expectedAvatarPath:null},user),error=>error.avatarWriteUncertain===true);
 assert.equal(s.operations.some(op=>op.targets),false);
 const missing=stub({saveError:{code:'PGRST204',message:'avatar_path'}});await assert.rejects(missing.repository.save({nickname:'用户昵称',avatarKey:'blue',avatarPath:path,expectedAvatarPath:null},user),{code:'AVATAR_NOT_CONFIGURED'});
});
test('settings integrates crop before explicit save and never uploads from crop preview',()=>{
 const settings=readFileSync(new URL('../src/tabs/SettingsTab.jsx',import.meta.url),'utf8');const crop=readFileSync(new URL('../src/components/AvatarCropper.jsx',import.meta.url),'utf8');
 assert.match(settings,/onConfirm=\{blob => \{ setPendingAvatar\(blob\)/);assert.match(settings,/expectedAvatarPath: customAvatar\.path/);
 assert.doesNotMatch(crop,/supabase|\.upload\(|fetch\(/);assert.match(crop,/encodeCommunityAvatar\(image, crop\)/);
});

let cacheFixtureId = 0;
async function loadAvatarCache({ signFails = false, pauseRead = null } = {}) {
 const calls = { read: 0, sign: 0 }, clock = { now: 0 }; let authListener, identity = user;
 const repository = {
  async authenticate(expected) { if (expected !== identity) throw Object.assign(new Error('account changed'), { code:'AVATAR_ACCOUNT_CHANGED' }); },
  async read(expected) { calls.read++; if (pauseRead) await pauseRead; return { path: `${expected}/${object}.webp`, configured:true }; },
  async resolve(target) { calls.sign++; if (signFails) throw new Error('image temporarily missing'); return `${origin}/storage/v1/object/sign/community-avatars/${target}?token=example-test-only`; },
  async upload() {}, async remove() {}, async save(profile) { return profile; },
 };
 const fixtureKey = `__communityAvatarCacheTest${++cacheFixtureId}`;
 globalThis[fixtureKey] = { repository, clock, supabase:{auth:{onAuthStateChange(listener){ authListener=listener; }}} };
 let source = readFileSync(new URL('../src/lib/communityAvatarDb.js',import.meta.url),'utf8');
 source = source.replace(/^import .*;\n/gm,'').replace(/^const repository = .*;$/m, `const { repository, supabase, clock } = globalThis[${JSON.stringify(fixtureKey)}]; const Date = {now:()=>clock.now};`);
 const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 delete globalThis[fixtureKey];
 return { module,calls,clock,restoreSign:()=>{signFails=false;},auth:(id,event='SIGNED_IN')=>{identity=id;authListener(event,{user:{id}});} };
}
test('avatar cache shares reads/signatures and never extends cached URL expiry on reuse', async()=>{
 const s=await loadAvatarCache();
 const first=s.module.fetchCommunityAvatar(user), second=s.module.fetchCommunityAvatar(user);
 assert.equal(first,second); await first; assert.deepEqual(s.calls,{read:1,sign:1});
 s.clock.now=479999;await s.module.fetchCommunityAvatar(user);assert.deepEqual(s.calls,{read:1,sign:1});
 s.clock.now=480001;await s.module.fetchCommunityAvatar(user);assert.deepEqual(s.calls,{read:2,sign:2});
});
test('failed image signing preserves authenticated metadata so the owner can replace or clear the image', async()=>{
 const s=await loadAvatarCache({signFails:true});
 assert.deepEqual(await s.module.fetchCommunityAvatar(user),{path,url:'',configured:true,imageUnavailable:true,expiresAt:0});
 s.restoreSign(); const recovered=await s.module.fetchCommunityAvatar(user,{force:true});
 assert.equal(recovered.path,path);assert.equal(recovered.imageUnavailable,false);assert.equal(recovered.url,signedUrl);
});
test('initial auth event preserves same-owner in-flight reads and account switches reject old results', async()=>{
 let release;const pauseRead=new Promise(resolve=>{release=resolve;});const s=await loadAvatarCache({pauseRead});
 const first=s.module.fetchCommunityAvatar(user);await Promise.resolve();s.auth(user,'INITIAL_SESSION');release();
 assert.equal((await first).path,path);
 let notifications=0;const unsubscribe=s.module.subscribeCommunityAvatar(user,()=>notifications++);
 s.auth(other);assert.equal(notifications,1);await assert.rejects(s.module.fetchCommunityAvatar(user),{code:'AVATAR_ACCOUNT_CHANGED'});
 const next=await s.module.fetchCommunityAvatar(other);assert.equal(next.path,`${other}/${object}.webp`);unsubscribe();
});
test('Settings refreshes the CAS base on every open and blocks avatar mutation before metadata resolves',()=>{
 const settings=readFileSync(new URL('../src/tabs/SettingsTab.jsx',import.meta.url),'utf8');
 assert.match(settings,/db\.fetchCommunityAvatar\(user\.id, \{ force: true \}\)/);
 assert.doesNotMatch(settings,/if \(avatarUncertainRef\.current && db\.fetchCommunityAvatar\)/);
 assert.match(settings,/error\?\.code === 'AVATAR_CONFLICT'/);
 assert.match(settings,/communitySavingRef\.current \|\| communityLoading \|\| !customAvatar\.ready/);
 assert.match(settings,/disabled: communityLoading \|\| communitySaving \|\| !customAvatar\.ready/);
});
test('an account switch during a profile read cannot commit or return the previous owner avatar',async()=>{
 let release;const pauseRead=new Promise(resolve=>{release=resolve;});const s=await loadAvatarCache({pauseRead});
 s.auth(user,'INITIAL_SESSION');const pending=s.module.fetchCommunityAvatar(user);await Promise.resolve();
 s.auth(other);release();await assert.rejects(pending,{code:'AVATAR_ACCOUNT_CHANGED'});
 const result=await s.module.fetchCommunityAvatar(other);assert.equal(result.path,`${other}/${object}.webp`);
});
