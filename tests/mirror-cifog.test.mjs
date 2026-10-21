import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mirror, cifogText } from '../tools/mirror-cifog.mjs';

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'labs-mirror-'));
  t.after(() => fs.rmSync(base, {recursive:true, force:true}));
  const source = path.join(base, 'source'), target = path.join(base, 'target');
  fs.mkdirSync(source); fs.mkdirSync(target);
  const put = (root, file, text) => { const p=path.join(root,file); fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text); };
  const git = (...args) => execFileSync('git',['-C',source,...args],{stdio:'pipe'});
  git('init'); git('config','user.email','test@example.invalid'); git('config','user.name','Mirror Test');
  put(source,'index.html','<title>Carrot Revolt Labs</title>'); put(source,'package.json','{"name":"carrot-revolt-labs"}');
  const commit=()=>{git('add','.');git('commit','-m','Fixture','--allow-empty');};
  return {source,target,put,commit};
}

test('mirrors new labs and binary assets, preserves infrastructure, and is idempotent', t => {
  const {source,target,put,commit}=fixture(t);
  put(source,'labs/new/app.js',"localStorage.getItem('carrot-revolt-new:progress')");
  put(source,'assets/image.png',Buffer.from([0,255,12]));
  put(source,'.github/workflows/unwanted.yml','do not copy');
  put(source,'AGENTS.md','source policy'); put(target,'AGENTS.md','mirror policy');
  put(target,'.github/workflows/mirror.yml','keep this workflow');
  commit(); mirror({source,target});
  assert.match(fs.readFileSync(path.join(target,'labs/new/app.js'),'utf8'),/cifog-new:progress/);
  assert.deepEqual(fs.readFileSync(path.join(target,'assets/image.png')),Buffer.from([0,255,12]));
  assert.equal(fs.readFileSync(path.join(target,'AGENTS.md'),'utf8'),'mirror policy');
  assert.equal(fs.existsSync(path.join(target,'.github/workflows/unwanted.yml')),false);
  assert.equal(mirror({source,target}).changed,0);
});

test('propagates deletions only for previously mirrored files', t => {
  const {source,target,put,commit}=fixture(t);
  put(source,'labs/old/app.js','old'); put(target,'docs/local.md','keep'); commit(); mirror({source,target});
  fs.unlinkSync(path.join(source,'labs/old/app.js')); put(source,'labs/new/app.js','new'); commit();
  const result=mirror({source,target});
  assert.equal(result.removed,1);
  assert.equal(fs.existsSync(path.join(target,'labs/old/app.js')),false);
  assert.equal(fs.readFileSync(path.join(target,'docs/local.md'),'utf8'),'keep');
});

test('rejects a tampered deletion manifest before overwriting files', t => {
  const {source,target,put,commit}=fixture(t); commit();
  put(target,'index.html','unchanged');
  put(target,'.cifog-mirror.json',JSON.stringify({files:['../outside.txt']}));
  assert.throws(()=>mirror({source,target}),/Unsafe mirror path/);
  assert.equal(fs.readFileSync(path.join(target,'index.html'),'utf8'),'unchanged');
});

test('keeps the embed branding filter and adapts public URLs and wordmarks', () => {
  const input='<link rel="stylesheet" href="../../brand.css?v=1">\nCARROT<span>REVOLT LABS · https://carrotrevoltstudio.com/labs/new/';
  assert.equal(cifogText(input),'cifog<span>LAB · https://xavikai.github.io/cifog-lab/labs/new/');
  assert.equal(cifogText('/CIFOG|Carrot\\s+Revolt/'),'/CIFOG|Carrot\\s+Revolt/');
});
