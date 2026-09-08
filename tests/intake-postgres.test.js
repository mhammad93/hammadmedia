'use strict';

// Real PostgreSQL integration tests; opt in because they start one isolated local Docker container.
// No ports, bind mounts, production credentials or network access. Container is removed in finally.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('real PostgreSQL: service-only access, concurrent idempotency/rate limits, leases and immutable content', { skip: process.env.INTAKE_TEST_POSTGRES !== '1', timeout: 120000 }, async () => {
  const container = `hm-intake-test-${randomUUID().slice(0, 8)}`;
  const image = 'public.ecr.aws/supabase/postgres:17.6.1.167';
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const command = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
  const sql = statement => execFileSync('docker', command, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const parallelSql = statement => new Promise((resolve, reject) => {
    const child = spawn('docker', command); let output = '', error = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { error += data; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(statement);
  });
  const id = randomUUID(), hash = 'a'.repeat(64), ip = 'b'.repeat(64), email = 'c'.repeat(64);
  const accept = (receiptId = id, digest = hash, ipDigest = ip, emailDigest = email) => `select public.hm_intake_accept('${receiptId}','${digest}',${quote(JSON.stringify({ submission_id: receiptId, brand: 'Synthetic test only' }))}::jsonb,'${ipDigest}','${emailDigest}');`;
  const asService = statement => `set role service_role; ${statement}`;
  try {
    execFileSync('docker', ['run', '--rm', '-d', '--network', 'none', '--name', container, '-e', `POSTGRES_PASSWORD=${randomUUID()}`, image,
      'postgres', '-D', '/var/lib/postgresql/data', '-c', 'config_file=/etc/postgresql/postgresql.conf'], { stdio: 'pipe' });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        // The image briefly starts a temporary server during initialization. Wait for the final PID 1 server.
        const pid = execFileSync('docker', ['exec', container, 'head', '-1', '/var/lib/postgresql/data/postmaster.pid'], { encoding: 'utf8', stdio: 'pipe' }).trim();
        if (pid !== '1') throw new Error('initializing');
        execFileSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' }); ready = true; break;
      }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.equal(ready, true, 'isolated PostgreSQL starts');
    sql("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;");
    sql(readFileSync(join(__dirname, '../db/intake-schema.sql'), 'utf8'));

    assert.equal(sql("select relrowsecurity from pg_class where oid='hm_intake_private.submissions'::regclass;"), 't');
    for (const role of ['anon', 'authenticated']) {
      assert.throws(() => sql(`set role ${role}; select public.hm_intake_health();`), /Command failed/);
      assert.throws(() => sql(`set role ${role}; select id from hm_intake_private.submissions;`), /Command failed/);
      assert.equal(sql(`select has_function_privilege('${role}','public.hm_intake_accept(uuid,text,jsonb,text,text)','EXECUTE');`), 'f');
    }

    const duplicateResults = await Promise.all(Array.from({ length: 8 }, () => parallelSql(asService(accept()))));
    assert.ok(duplicateResults.every(result => result.endsWith('{"status": "received"}')));
    assert.equal(sql('select count(*) from hm_intake_private.submissions;'), '1');
    assert.match(sql(asService(accept(id, 'd'.repeat(64)))), /"status": "conflict"/);
    assert.equal(sql(`select content_hash from hm_intake_private.submissions where id='${id}';`), hash);
    assert.throws(() => sql(asService(`update hm_intake_private.submissions set content_hash='${'e'.repeat(64)}' where id='${id}';`)));
    assert.throws(() => sql(asService(`update hm_intake_private.submissions set payload='{}' where id='${id}';`)));
    assert.throws(() => sql(asService(`update hm_intake_private.submissions set payload=null where id='${id}';`)), /submission content is immutable/, 'unresolved inquiry cannot be erased when completed_at is NULL');
    assert.equal(sql(`select payload is not null and completed_at is null from hm_intake_private.submissions where id='${id}';`), 't');

    const burst = await Promise.all(Array.from({ length: 8 }, () => parallelSql(asService(accept(randomUUID())))));
    assert.equal(burst.filter(result => result.includes('received')).length, 4, 'five per hour including original accepted receipt');
    assert.equal(burst.filter(result => result.includes('limited')).length, 4);
    assert.match(sql(asService(accept())), /received/, 'replay bypasses the new-submission rate limit');

    const lease = randomUUID(), otherLease = randomUUID();
    const claimed = JSON.parse(sql(`select public.hm_intake_claim('${lease}');`));
    const other = JSON.parse(sql(`select public.hm_intake_claim('${otherLease}');`));
    assert.notEqual(claimed.id, other.id, 'concurrent workers own different records');
    assert.equal(claimed.attempts, 1);
    assert.equal(JSON.parse(sql(`select public.hm_intake_save('${claimed.id}','${otherLease}','{"notion_state":"creating"}');`)).lost_lease, true);
    sql(`select public.hm_intake_save('${claimed.id}','${lease}','{"notion_state":"creating"}');`);
    assert.throws(() => sql(`select public.hm_intake_save('${claimed.id}','${lease}','{"payload":{}}');`));

    sql(`select public.hm_intake_save('${claimed.id}','${lease}','{"email_state":"sending","email_started_at":"2026-09-08T12:00:00Z","email_payload":{"to":["contact@hammadmedia.com"],"text":"Synthetic"}}');`);
    assert.throws(() => sql(`select public.hm_intake_save('${claimed.id}','${lease}','{"email_payload":{"text":"Changed"}}');`));
    assert.throws(() => sql(`select public.hm_intake_save('${claimed.id}','${lease}','{"email_started_at":"2026-09-09T12:00:00Z"}');`));
    // Supplying a completion timestamp in the same write must not bypass the
    // envelope guard; retention eligibility is based on the existing row.
    assert.throws(() => sql(asService(`update hm_intake_private.submissions set email_payload=null, completed_at=now() where id='${claimed.id}';`)), /email envelope is immutable/);
    assert.equal(sql(`select email_payload is not null and completed_at is null from hm_intake_private.submissions where id='${claimed.id}';`), 't');
    sql(`update hm_intake_private.submissions set lease_until=now()-interval '1 second' where id='${claimed.id}';`);
    assert.equal(JSON.parse(sql(`select public.hm_intake_save('${claimed.id}','${lease}','{"notion_state":"pending"}');`)).lost_lease, true);
    const replacementLease = randomUUID();
    const reclaimed = JSON.parse(sql(`select public.hm_intake_claim('${replacementLease}');`));
    assert.equal(reclaimed.id, claimed.id); assert.equal(reclaimed.notion_state, 'creating', 'crashed create marker survives lease expiry');
    assert.equal(sql(`select public.hm_intake_release('${claimed.id}','${lease}',60);`), 'f', 'stale worker cannot release new owner');

    sql(`select public.hm_intake_save('${claimed.id}','${replacementLease}','{"notion_state":"synced","notion_page_id":"${randomUUID()}","email_state":"accepted","email_id":"synthetic-provider-id"}');`);
    sql(`select public.hm_intake_release('${claimed.id}','${replacementLease}',60);`);
    sql(`update hm_intake_private.submissions set completed_at=now()-interval '31 days' where id='${claimed.id}';`);
    assert.equal(sql('select public.hm_intake_prune();'), '1');
    assert.equal(sql(`select payload is null and email_payload is null and ip_hash is null from hm_intake_private.submissions where id='${claimed.id}';`), 't');
    assert.match(sql(`select public.hm_intake_receipt('${claimed.id}','${hash}');`), /received/, 'retention cleanup keeps duplicate-prevention tombstone');
  } finally {
    execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
  }
});
