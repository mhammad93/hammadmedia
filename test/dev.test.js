'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn} = require('node:child_process');
const {once} = require('node:events');

async function startPreview(t, {host, build = true, fallback = true} = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-preview-test-'));
  fs.copyFileSync(path.join(__dirname, '../dev.js'), path.join(fixture, 'dev.js'));
  fs.writeFileSync(path.join(fixture, 'outside.txt'), 'Outside the preview root');
  if (build) {
    fs.mkdirSync(path.join(fixture, 'dist/docs'), {recursive:true});
    fs.writeFileSync(path.join(fixture, 'dist/index.html'), '<h1>Preview control</h1>');
    fs.writeFileSync(path.join(fixture, 'dist/docs/index.html'), '<h1>Directory control</h1>');
    fs.writeFileSync(path.join(fixture, 'dist/hello world.txt'), 'Encoded filename control');
    if (fallback) fs.writeFileSync(path.join(fixture, 'dist/404.html'), '<h1>Custom not found</h1>');
  }
  const child = spawn(process.execPath, [path.join(fixture, 'dev.js')], {
    cwd:fixture,
    env:{PORT:'0', HOST:'0.0.0.0', ...(host ? {HM_PREVIEW_HOST:host} : {})},
    stdio:['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    fs.rmSync(fixture, {recursive:true, force:true});
  });
  const address = await new Promise((resolve, reject) => {
    let stdout = '';
    const timeout = setTimeout(() => reject(new Error(`Preview startup timed out: ${stderr}`)), 5000);
    const finish = (error, url) => {
      clearTimeout(timeout);
      child.removeListener('error', fail);
      child.removeListener('exit', stopped);
      if (error) reject(error);
      else resolve(url);
    };
    const fail = error => finish(error);
    const stopped = code => finish(new Error(`Preview exited with ${code}: ${stderr}`));
    child.once('error', fail);
    child.once('exit', stopped);
    child.stdout.setEncoding('utf8').on('data', chunk => {
      stdout += chunk;
      const match = stdout.match(/Hammad Media preview at (http:\/\/\S+)/);
      if (match) finish(null, new URL(match[1]));
    });
  });
  const request = (target, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({host:'127.0.0.1', port:address.port, path:target, method, agent:false}, res => {
      let body = '';
      res.setEncoding('utf8').on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({status:res.statusCode, headers:res.headers, body}));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('Preview request timed out')));
    req.end();
  });
  return {address, request, child, errors:() => stderr};
}

test('malformed preview targets return 400 and subsequent requests still work on loopback', async t => {
  const preview = await startPreview(t);
  assert.equal(preview.address.hostname, '127.0.0.1');
  assert.notEqual(preview.address.port, '0');
  for (const target of ['/%', '/%2', '/%GG', '/%C0%AF', '/%E0%A4%A', '/%ED%A0%80', '/%FF', '//[', 'http://[']) {
    assert.equal((await preview.request(target)).status, 400, target);
    const control = await preview.request('/');
    assert.equal(control.status, 200, target);
    assert.equal(control.body, '<h1>Preview control</h1>');
  }
  assert.equal(preview.child.exitCode, null);
  assert.equal(preview.errors(), '');
});

test('preview keeps static routes, containment, disabled intake and custom 404 responses', async t => {
  const preview = await startPreview(t);
  const directory = await preview.request('/docs/');
  assert.equal(directory.status, 200);
  assert.equal(directory.body, '<h1>Directory control</h1>');
  assert.match(directory.headers['content-type'], /^text\/html/);
  const encoded = await preview.request('/hello%20world.txt?bad=%');
  assert.equal(encoded.status, 200);
  assert.equal(encoded.body, 'Encoded filename control');
  for (const target of ['/..%2foutside.txt', '/%2e%2e%2foutside.txt']) {
    assert.equal((await preview.request(target)).status, 403, target);
  }
  for (const target of ['/api/intake-config', '/api/intake-config?bad=%']) {
    const config = await preview.request(target);
    assert.equal(config.status, 200);
    assert.deepEqual(JSON.parse(config.body), {enabled:false, turnstileSiteKey:null, action:'brand_inquiry'});
  }
  for (const target of ['/api/intake', '/api/intake-retry', '/api/%']) {
    const response = await preview.request(target, 'POST');
    assert.equal(response.status, 503, target);
    assert.deepEqual(JSON.parse(response.body), {ok:false, error:'Preview delivery disabled'});
  }
  const missing = await preview.request('/missing');
  assert.equal(missing.status, 404);
  assert.equal(missing.body, '<h1>Custom not found</h1>');
  assert.equal((await preview.request('/%00')).status, 404);
  assert.equal((await preview.request('/')).status, 200);
});

test('preview survives missing 404 pages and missing builds', async t => {
  for (const build of [true, false]) {
    const preview = await startPreview(t, {build, fallback:false});
    for (const target of ['/missing', '/%00']) {
      const response = await preview.request(target);
      assert.equal(response.status, 404);
      assert.equal(response.body, 'Not found');
    }
    assert.equal((await preview.request('/%')).status, 400);
    assert.equal((await preview.request('/')).status, build ? 200 : 404);
    assert.equal((await preview.request('/api/intake')).status, 503);
    assert.equal(preview.child.exitCode, null);
    assert.equal(preview.errors(), '');
  }
});

test('preview permits an explicit HM_PREVIEW_HOST override for deliberate network access', async t => {
  const preview = await startPreview(t, {host:'0.0.0.0'});
  assert.equal(preview.address.hostname, '0.0.0.0');
  assert.equal((await preview.request('/')).status, 200);
});
