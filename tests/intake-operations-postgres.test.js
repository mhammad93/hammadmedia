'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

test('operations PostgreSQL: private, default-off, missing cycles, concurrent alert dedup, frozen retry and recovery', { skip: process.env.INTAKE_TEST_POSTGRES !== '1', timeout: 120000 }, async t => {
  const container = `hm-ops-test-${randomUUID().slice(0, 8)}`;
  const command = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
  const sql = statement => execFileSync('docker', command, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const rpc = statement => JSON.parse(sql(`set role service_role; select ${statement};`).split('\n').at(-1));
  const claim = lease => rpc(`public.hm_intake_ops_claim('${lease}')`);
  const parallel = statement => new Promise((resolve, reject) => {
    const child = spawn('docker', command); let output = '', errors = '';
    child.stdout.on('data', x => { output += x; }); child.stderr.on('data', x => { errors += x; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(JSON.parse(output.trim())) : reject(new Error(errors))); child.stdin.end(statement);
  });
  try {
    execFileSync('docker', ['run', '--rm', '-d', '--network', 'none', '--name', container, '-e', `POSTGRES_PASSWORD=${randomUUID()}`, 'public.ecr.aws/supabase/postgres:17.6.1.167', 'postgres', '-D', '/var/lib/postgresql/data', '-c', 'config_file=/etc/postgresql/postgresql.conf'], { stdio: 'pipe' });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if (execFileSync('docker', ['exec', container, 'head', '-1', '/var/lib/postgresql/data/postmaster.pid'], { encoding: 'utf8', stdio: 'pipe' }).trim() !== '1') throw new Error('initializing');
        execFileSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' }); ready = true; break;
      } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.equal(ready, true);
    sql("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;");
    sql(readFileSync(join(__dirname, '../db/intake-schema.sql'), 'utf8'));
    const schema = join(__dirname, '../db/intake-operations.sql');
    if (existsSync(schema)) sql(readFileSync(schema, 'utf8'));
    assert.equal(sql("select to_regprocedure('public.hm_intake_ops_claim(uuid)') is not null;"), 't', 'the operations claim must exist');
    for (const role of ['anon', 'authenticated']) {
      for (const fn of ['hm_intake_ops_claim(uuid)', 'hm_intake_ops_worker_completed()', 'hm_intake_ops_health()', 'hm_intake_ops_watchdog_completed()', 'hm_intake_ops_prepare(uuid,uuid,jsonb)', 'hm_intake_ops_finish(uuid,uuid,text,text,text)']) {
        assert.equal(sql(`select has_function_privilege('${role}', 'public.${fn}', 'EXECUTE');`), 'f');
      }
      assert.throws(() => sql(`set role ${role}; select * from hm_intake_private.operations;`));
    }
    assert.deepEqual(claim(randomUUID()), { enabled: false, item: null });
    assert.equal(sql('select count(*) from hm_intake_private.operation_notifications;'), '0');
    assert.equal(sql('select public.hm_intake_ops_worker_completed();'), 't');
    sql("update hm_intake_private.operations set enabled=true, activated_at=now(), last_worker_completed_at=null;");
    assert.equal(claim(randomUUID()).item, null, 'activation grace does not invent a missed cycle');
    sql("update hm_intake_private.operations set activated_at=now()-interval '6 minutes';");
    const lease = randomUUID();
    const first = claim(lease).item;
    assert.equal(first.kind, 'opened');
    assert.equal(first.snapshot.conditions, 4);
    assert.equal(first.snapshot.manual, 0);
    assert.equal(first.snapshot.worker_age_seconds, null);
    assert.equal(claim(randomUUID()).item, null, 'an active lease prevents concurrent delivery');
    const payload = { from: 'intake@notifications.hammadmedia.com', to: ['contact@hammadmedia.com'], subject: 'Synthetic operations fixture', text: 'Counts only: pending 0; manual 0; overdue 0.' };
    const prepared = rpc(`public.hm_intake_ops_prepare('${first.id}','${lease}',${quote(JSON.stringify(payload))}::jsonb)`);
    assert.deepEqual(prepared.email_payload, payload);
    const frozen = rpc(`public.hm_intake_ops_prepare('${first.id}','${lease}',${quote(JSON.stringify({ ...payload, text: 'Changed template' }))}::jsonb)`);
    assert.deepEqual(frozen.email_payload, payload, 'template changes cannot modify the retry envelope');
    assert.equal(frozen.send_started_at, prepared.send_started_at);
    assert.equal(sql(`select public.hm_intake_ops_finish('${first.id}','${randomUUID()}','accepted','provider-test',null);`), 'f');
    assert.throws(() => sql(`select public.hm_intake_ops_finish('${first.id}','${lease}','accepted',null,null);`));
    assert.equal(sql(`select public.hm_intake_ops_finish('${first.id}','${lease}','accepted','provider-test',null);`), 't');
    assert.equal(claim(randomUUID()).item, null, 'healthy notification acceptance does not create another opening');
    sql("update hm_intake_private.operations set last_notice_queued_at=now()-interval '61 minutes';");
    const contenders = await Promise.all(Array.from({ length: 4 }, () => parallel(`select public.hm_intake_ops_claim('${randomUUID()}');`)));
    assert.equal(contenders.filter(x => x.item !== null).length, 1, 'one concurrent worker claims one reminder');
    const reminder = contenders.find(x => x.item)?.item;
    assert.equal(reminder.kind, 'reminder');
    sql(`select public.hm_intake_ops_prepare('${reminder.id}','${reminder.lease_id}',${quote(JSON.stringify(payload))}); select public.hm_intake_ops_finish('${reminder.id}','${reminder.lease_id}','accepted','reminder-test',null);`);
    sql('select public.hm_intake_ops_worker_completed();');
    const recovered = claim(randomUUID()).item;
    assert.equal(recovered.kind, 'recovered');
    assert.equal(recovered.snapshot.conditions, 0);
    assert.equal(claim(randomUUID()).item, null, 'one recovery is queued once');
    sql(`select public.hm_intake_ops_prepare('${recovered.id}','${recovered.lease_id}',${quote(JSON.stringify(payload))}); select public.hm_intake_ops_finish('${recovered.id}','${recovered.lease_id}','accepted','recovery-test',null);`);
    for (const earlierState of ['in-flight', 'retry', 'manual']) await t.test(`recovery waits behind an earlier ${earlierState} notice`, async () => {
      sql("truncate hm_intake_private.operation_notifications; update hm_intake_private.operations set activated_at=now()-interval '10 minutes',last_worker_completed_at=null,incident_id=null,last_notice_conditions=0,last_notice_queued_at=null;");
      const earlierLease = randomUUID();
      const earlier = claim(earlierLease).item;
      sql(`select public.hm_intake_ops_prepare('${earlier.id}','${earlierLease}',${quote(JSON.stringify(payload))});`);
      if (earlierState !== 'in-flight') {
        sql(`select public.hm_intake_ops_finish('${earlier.id}','${earlierLease}','${earlierState}',null,'${earlierState === 'retry' ? 'send_unconfirmed' : 'send_rejected'}');`);
        if (earlierState === 'retry') sql(`update hm_intake_private.operation_notifications set next_attempt_at=now()+interval '30 minutes' where id='${earlier.id}';`);
      }
      sql('select public.hm_intake_ops_worker_completed();');
      assert.equal(claim(randomUUID()).item, null, 'recovery cannot overtake an unresolved opening');
      assert.equal(sql('select count(*) from hm_intake_private.operation_notifications;'), '1');
      assert.equal(sql('select incident_id from hm_intake_private.operations;'), earlier.incident_id, 'the incident remains open until notification order is resolved');
      if (earlierState === 'manual') {
        assert.equal(claim(randomUUID()).item, null, 'manual review cannot silently manufacture a new recovery key');
        assert.equal(sql(`select state from hm_intake_private.operation_notifications where id='${earlier.id}';`), 'manual');
        return;
      }
      let acceptanceLease = earlierLease;
      if (earlierState === 'retry') {
        sql(`update hm_intake_private.operation_notifications set next_attempt_at=now()-interval '1 minute' where id='${earlier.id}';`);
        acceptanceLease = randomUUID();
        const retried = claim(acceptanceLease).item;
        assert.equal(retried.id, earlier.id);
        assert.deepEqual(retried.email_payload, payload, 'the old request and key remain unchanged');
        sql(`select public.hm_intake_ops_prepare('${earlier.id}','${acceptanceLease}',${quote(JSON.stringify(payload))});`);
      }
      sql(`select public.hm_intake_ops_finish('${earlier.id}','${acceptanceLease}','accepted','ordered-opening-test',null);`);
      const following = claim(randomUUID()).item;
      assert.equal(following.kind, 'recovered');
      assert.equal(following.incident_id, earlier.incident_id);
      assert.equal(claim(randomUUID()).item, null, 'a recovery with an active lease remains singular');
    });
    await t.test('a recurring incident cannot overtake an older recovery retry', async () => {
      sql("truncate hm_intake_private.operation_notifications; update hm_intake_private.operations set activated_at=now()-interval '10 minutes',last_worker_completed_at=null,incident_id=null,last_notice_conditions=0,last_notice_queued_at=null;");
      const oldOpening = claim(randomUUID()).item;
      sql(`select public.hm_intake_ops_prepare('${oldOpening.id}','${oldOpening.lease_id}',${quote(JSON.stringify(payload))}); select public.hm_intake_ops_finish('${oldOpening.id}','${oldOpening.lease_id}','accepted','old-opening-test',null); select public.hm_intake_ops_worker_completed();`);
      const oldRecovery = claim(randomUUID()).item;
      assert.equal(oldRecovery.kind, 'recovered');
      sql(`select public.hm_intake_ops_prepare('${oldRecovery.id}','${oldRecovery.lease_id}',${quote(JSON.stringify(payload))}); select public.hm_intake_ops_finish('${oldRecovery.id}','${oldRecovery.lease_id}','retry',null,'send_unconfirmed'); update hm_intake_private.operation_notifications set next_attempt_at=now()+interval '30 minutes' where id='${oldRecovery.id}'; update hm_intake_private.operations set last_worker_completed_at=now()-interval '10 minutes';`);
      assert.equal(claim(randomUUID()).item, null, 'a new opening waits behind the older recovery outcome');
      sql(`update hm_intake_private.operation_notifications set next_attempt_at=now()-interval '1 minute' where id='${oldRecovery.id}';`);
      const retriedRecovery = claim(randomUUID()).item;
      assert.equal(retriedRecovery.id, oldRecovery.id);
      assert.deepEqual(retriedRecovery.email_payload, payload);
      sql(`select public.hm_intake_ops_prepare('${retriedRecovery.id}','${retriedRecovery.lease_id}',${quote(JSON.stringify(payload))}); select public.hm_intake_ops_finish('${retriedRecovery.id}','${retriedRecovery.lease_id}','accepted','old-recovery-test',null);`);
      const newOpening = claim(randomUUID()).item;
      assert.equal(newOpening.kind, 'opened');
      assert.notEqual(newOpening.incident_id, oldOpening.incident_id);
    });
    sql("truncate hm_intake_private.operation_notifications; update hm_intake_private.operations set last_worker_completed_at=now(),incident_id=null,last_notice_conditions=0,last_notice_queued_at=null;");
    const receipt = randomUUID();
    sql(`insert into hm_intake_private.submissions(id,content_hash,payload,created_at,notion_state) values('${receipt}',repeat('a',64),'${JSON.stringify({ secret: 'DO-NOT-EXPOSE-PRIVATE-INQUIRY' })}',now()-interval '20 minutes','manual');`);
    const before = sql('select to_jsonb(s) from hm_intake_private.submissions s;');
    const queueAlert = claim(randomUUID()).item;
    assert.equal(queueAlert.snapshot.conditions, 3);
    assert.equal(queueAlert.snapshot.manual, 1);
    assert.equal(queueAlert.snapshot.overdue, 1);
    assert.doesNotMatch(JSON.stringify(queueAlert), /DO-NOT-EXPOSE|secret|payload.*secret/);
    sql(`select public.hm_intake_ops_prepare('${queueAlert.id}','${queueAlert.lease_id}',${quote(JSON.stringify(payload))}); select public.hm_intake_ops_finish('${queueAlert.id}','${queueAlert.lease_id}','retry',null,'send_unconfirmed');`);
    sql(`update hm_intake_private.operation_notifications set send_started_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 minute' where id='${queueAlert.id}';`);
    assert.equal(claim(randomUUID()).item, null, 'uncertain old sends cannot receive a fresh automatic key');
    assert.equal(sql(`select state from hm_intake_private.operation_notifications where id='${queueAlert.id}';`), 'manual');
    assert.equal(sql('select to_jsonb(s) from hm_intake_private.submissions s;'), before, 'watchdog never changes the intake queue');
    sql('select public.hm_intake_ops_watchdog_completed();');
    const health = rpc('public.hm_intake_ops_health()');
    assert.equal(health.notification_manual, 1);
    assert.ok(health.last_watchdog_completed_at);
    assert.doesNotMatch(JSON.stringify(health), /DO-NOT-EXPOSE|provider-test|contact@/);
    await t.test('actual watchdog reports expiry into manual and remains unhealthy on the next tick', async () => {
      const { createWatchdog } = await import(pathToFileURL(join(__dirname, '../supabase/functions/intake-watchdog/core.mjs')));
      const testSecret = 'synthetic-watchdog-secret-only-0123456789';
      const handler = createWatchdog({ env: {
        HM_INTAKE_WATCHDOG_ENABLED: 'true', HM_INTAKE_WATCHDOG_SECRET: testSecret,
        INTAKE_SUPABASE_URL: 'https://synthetic.supabase.co', INTAKE_SUPABASE_SECRET_KEY: 'sb_secret_synthetic_test_only_0123456789',
        RESEND_OPS_API_KEY: 're_synthetic_test_only', RESEND_FROM_EMAIL: 'intake@notifications.hammadmedia.com'
      }, fetcher: async (url, request) => {
        assert.ok(url.startsWith('https://synthetic.supabase.co/rest/v1/rpc/'), 'manual notices must never make an email request');
        const name = url.split('/').at(-1);
        const params = JSON.parse(request.body);
        const args = { hm_intake_ops_claim: ['p_lease'], hm_intake_ops_watchdog_completed: [], hm_intake_ops_health: [] };
        assert.ok(name in args, 'only aggregate claim/health/completion RPCs are expected');
        const expression = `public.${name}(${args[name].map(key => quote(params[key])).join(',')})`;
        return new Response(JSON.stringify(rpc(`to_jsonb(${expression})`)));
      } });
      sql(`update hm_intake_private.operation_notifications set state='retry',error_code='send_unconfirmed' where id='${queueAlert.id}';`);
      for (let tick = 0; tick < 2; tick++) {
        const result = await handler(new Request('https://synthetic.invalid/watchdog', { method: 'POST', headers: { 'x-hm-watchdog-secret': testSecret } }));
        assert.equal(result.status, 503, 'expiry and subsequent manual holds remain attention states');
        assert.deepEqual(await result.json(), { ok: false, enabled: true, processed: 0, notifications: { pending: 0, manual: 1 } });
      }
      assert.equal(sql(`select state from hm_intake_private.operation_notifications where id='${queueAlert.id}';`), 'manual');
      assert.ok(rpc('public.hm_intake_ops_health()').last_watchdog_completed_at);
    });
    assert.doesNotThrow(() => sql("insert into hm_intake_private.operation_notifications(incident_id,kind,snapshot) values(gen_random_uuid(),'test','{\"conditions\":0,\"pending\":0,\"manual\":0,\"overdue\":0,\"worker_age_seconds\":null}');"));
    const testNotice = claim(randomUUID()).item;
    assert.equal(testNotice.kind, 'test');
    assert.throws(() => sql(`select public.hm_intake_ops_prepare('${testNotice.id}','${testNotice.lease_id}',${quote(JSON.stringify({ ...payload, to: ['someone@example.com'] }))});`), /invalid operations envelope/);
  } finally {
    try { execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' }); } catch { /* isolated cleanup */ }
  }
});
