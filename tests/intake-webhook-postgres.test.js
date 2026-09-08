'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

test('Resend PostgreSQL ledger: permissions, disabled gate, durable race/reorder handling, no inquiry mutation', { skip: process.env.INTAKE_TEST_POSTGRES !== '1', timeout: 120000 }, async t => {
  const container = `hm-webhook-test-${randomUUID().slice(0, 8)}`;
  const command = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
  const sql = statement => execFileSync('docker', command, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const rpc = statement => JSON.parse(sql(`set role service_role; select ${statement};`).split('\n').at(-1));
  const record = (id, email, type = 'email.delivered', at = '2026-01-01T01:00:00Z', hash = 'a'.repeat(64)) => `public.hm_intake_resend_record(${quote(id)},'${email}','${type}','${at}','${hash}')`;
  const parallel = statement => new Promise((resolve, reject) => {
    const child = spawn('docker', command); let output = '', errors = '';
    child.stdout.on('data', x => { output += x; }); child.stderr.on('data', x => { errors += x; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(JSON.parse(output.trim().split('\n').at(-1))) : reject(new Error(errors))); child.stdin.end(statement);
  });
  const health = () => rpc('public.hm_intake_resend_health()');
  const status = id => JSON.parse(sql(`select row_to_json(s) from hm_intake_private.resend_delivery_status s where email_id='${id}';`));
  const known = id => sql(`insert into hm_intake_private.submissions(id,content_hash,email_state,email_id) values('${randomUUID()}','${'f'.repeat(64)}','accepted','${id}');`);
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
    const file = join(__dirname, '../db/intake-resend-webhook.sql');
    if (existsSync(file)) sql(readFileSync(file, 'utf8'));
    assert.equal(sql("select to_regprocedure('public.hm_intake_resend_record(text,uuid,text,timestamptz,text)') is not null;"), 't', 'the durable signed-event recording function must exist');

    await t.test('private data and runtime enable switch are inaccessible to client roles', () => {
      for (const role of ['anon', 'authenticated']) {
        for (const fn of ['hm_intake_resend_record(text,uuid,text,timestamptz,text)', 'hm_intake_resend_health()']) assert.equal(sql(`select has_function_privilege('${role}','public.${fn}','EXECUTE');`), 'f');
        assert.throws(() => sql(`set role ${role}; select * from hm_intake_private.resend_delivery_status;`));
      }
      assert.equal(sql("select bool_and(relrowsecurity) from pg_class where oid in ('hm_intake_private.resend_webhook_control'::regclass,'hm_intake_private.resend_events'::regclass);"), 't');
      assert.equal(sql("select bool_and(not prosecdef and proconfig @> array['search_path=\"\"']) from pg_proc where oid in ('public.hm_intake_resend_record(text,uuid,text,timestamptz,text)'::regprocedure,'public.hm_intake_resend_health()'::regprocedure);"), 't');
      assert.throws(() => sql('set role service_role; update hm_intake_private.resend_webhook_control set enabled=true;'));
      const email = randomUUID();
      assert.deepEqual(rpc(record('msg_disabled', email)), { status: 'disabled' });
      assert.equal(sql('select count(*) from hm_intake_private.resend_events;'), '0');
      assert.equal(health().database_enabled, false); assert.equal(health().last_recorded_at, null);
    });
    sql('update hm_intake_private.resend_webhook_control set enabled=true;');
    await t.test('concurrent replay creates one row; conflicting same ID is durable attention', async () => {
      const email = randomUUID(); known(email);
      const results = await Promise.all(Array.from({ length: 8 }, () => parallel(`set role service_role; select ${record('msg_race', email)};`)));
      assert.equal(results.filter(x => x.status === 'recorded').length, 1);
      assert.equal(results.filter(x => x.status === 'duplicate').length, 7);
      const before = health().last_recorded_at;
      assert.deepEqual(rpc(record('msg_race', email)), { status: 'duplicate' });
      assert.equal(health().last_recorded_at, before, 'retry is not a new event heartbeat');
      assert.deepEqual(rpc(record('msg_race', email, 'email.bounced', '2026-01-01T01:00:00Z', 'b'.repeat(64))), { status: 'conflict' });
      assert.equal(status(email).state, 'conflicting');
      assert.equal(status(email).delivered_at, '2026-01-01T01:00:00+00:00');
      assert.equal(status(email).bounced_at, null, 'conflicting payload does not overwrite the recorded event');
      assert.equal(health().event_conflicts, 1);
      assert.throws(() => sql(`set role service_role; update hm_intake_private.resend_events set event_type='email.sent';`));
      assert.throws(() => sql('set role service_role; delete from hm_intake_private.resend_events;'));
    });
    await t.test('early and unordered events reconcile only when exact provider ID becomes known', () => {
      const email = randomUUID();
      rpc(record('msg_early_delivered', email, 'email.delivered', '2026-01-01T03:00:00Z'));
      assert.equal(health().unmatched_provider_messages, 1);
      assert.equal(sql(`select count(*) from hm_intake_private.resend_delivery_status where email_id='${email}';`), '0');
      known(email);
      assert.equal(health().unmatched_provider_messages, 0);
      assert.equal(status(email).state, 'delivered');
      rpc(record('msg_late_sent', email, 'email.sent', '2026-01-01T01:00:00Z'));
      rpc(record('msg_late_delay', email, 'email.delivery_delayed', '2026-01-01T02:00:00Z'));
      assert.equal(status(email).state, 'delivered', 'late sent/delay cannot regress terminal evidence');
      assert.equal(status(email).sent_at, '2026-01-01T01:00:00+00:00');
      assert.equal(status(email).delayed_at, '2026-01-01T02:00:00+00:00');
      rpc(record('msg_later_complaint', email, 'email.complained', '2026-01-01T04:00:00Z'));
      assert.equal(status(email).state, 'delivered'); assert.equal(status(email).attention, true);
    });
    await t.test('bounce/delivery conflict has identical result in both arrival orders', () => {
      for (const events of [['email.bounced', 'email.delivered'], ['email.delivered', 'email.bounced']]) {
        const email = randomUUID(); known(email);
        for (const type of events) rpc(record(`msg_${randomUUID()}`, email, type));
        const row = status(email);
        assert.equal(row.state, 'conflicting'); assert.equal(row.attention, true);
        assert.ok(row.delivered_at); assert.ok(row.bounced_at);
      }
    });
    await t.test('source acceptance, unknown delivery, failed/suppressed and duplicate mappings stay explicit', () => {
      const unknown = randomUUID(); known(unknown);
      assert.equal(status(unknown).state, 'unknown');
      assert.equal(status(unknown).provider_accepted, true);
      assert.equal(status(unknown).delivered_at, null);
      for (const [type, state] of [['email.failed', 'failed'], ['email.suppressed', 'suppressed'], ['email.bounced', 'bounced'], ['email.delivery_delayed', 'delayed'], ['email.sent', 'sent']]) {
        const email = randomUUID(); known(email); rpc(record(`msg_${randomUUID()}`, email, type));
        assert.equal(status(email).state, state);
        assert.equal(status(email).attention, ['failed', 'suppressed', 'bounced'].includes(state));
      }
      known(unknown);
      assert.equal(status(unknown).state, 'conflicting'); assert.equal(status(unknown).linked_submissions, 2);
      const aggregate = health();
      assert.equal(aggregate.known_messages, 10); assert.equal(aggregate.provider_accepted_messages, 10);
      assert.equal(aggregate.duplicate_message_links, 1);
      assert.equal(aggregate.delivery_unconfirmed_messages, 3);
      assert.doesNotMatch(JSON.stringify(aggregate), /@|email_id|msg_|payload|subject/);
    });
    await t.test('events cannot alter the outbox, create a CRM record or reopen a send', () => {
      const before = sql('select jsonb_agg(to_jsonb(s) order by id) from hm_intake_private.submissions s;');
      const email = sql('select email_id from hm_intake_private.submissions order by id limit 1;');
      rpc(record('msg_no_resend', email, 'email.bounced'));
      assert.equal(sql('select jsonb_agg(to_jsonb(s) order by id) from hm_intake_private.submissions s;'), before);
      assert.equal(sql('select count(*) from hm_intake_private.submissions where attempts<>0 or notion_page_id is not null;'), '0');
      assert.throws(() => rpc(record('msg_bad_type', email, 'email.opened')));
      assert.throws(() => rpc(record('msg_bad_time', email, 'email.sent', '2999-01-01T00:00:00Z')));
      sql('update hm_intake_private.resend_webhook_control set enabled=false;');
      const beforeDisabled = sql('select count(*) from hm_intake_private.resend_events;');
      assert.deepEqual(rpc(record('msg_disabled_again', email)), { status: 'disabled' });
      assert.equal(sql('select count(*) from hm_intake_private.resend_events;'), beforeDisabled);
    });
  } finally { execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' }); }
});
