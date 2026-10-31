import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202611030001_create_srm',
  async up({ builder }) {
    await builder.alterCollection('user', (t) => { t.string('referrerName', { length: 100 }); });
    await builder.createCollection('srmCompanies', (t) => {
      t.uuid('id').primary().notNull();
      t.string('ownerId').notNull().unique();
      t.string('creditCode', { length: 18 }).unique();
      t.string('supplierNo', { length: 32 }).unique();
      t.json('draft').notNull();
      t.json('snapshot');
      t.integer('submissionVersion').notNull().defaultTo(0);
      t.datetimeTz('submittedAt');
      t.datetimeTz('admittedAt');
      t.string('status').notNull();
      t.datetimeTz('statusChangedAt').notNull();
      t.integer('lifecycleVersion').notNull().defaultTo(0);
      t.datetimeTz('createdAt').notNull();
      t.index(['status', 'submittedAt']);
    });
    await builder.createCollection('srmVersions', (t) => {
      t.uuid('id').primary().notNull();
      t.uuid('companyId').notNull();
      t.integer('version').notNull();
      t.json('snapshot').notNull();
      t.datetimeTz('submittedAt').notNull();
      t.unique(['companyId', 'version']);
      t.foreignKey('companyId', { references: { collection: 'srmCompanies', fields: ['id'] } });
    });
    await builder.createCollection('srmCategories', (t) => {
      t.uuid('id').primary().notNull();
      t.string('name').notNull().unique();
      t.string('nameEn').notNull();
      t.boolean('active').notNull().defaultTo(true);
      t.integer('revision').notNull().defaultTo(0);
    });
    await builder.createCollection('srmFiles', (t) => {
      t.uuid('id').primary().notNull();
      t.string('ownerId').notNull();
      t.string('disk').notNull();
      t.text('key').notNull();
      t.text('filename').notNull();
      t.string('ext', { length: 32 }).notNull();
      t.string('mimeType').notNull();
      t.bigInt('size').notNull();
      t.datetime('createdAt').notNull();
      t.datetime('updatedAt').notNull();
      t.index('ownerId');
    });
    await builder.createCollection('srmAudit', (t) => {
      t.uuid('id').primary().notNull();
      t.string('actorId').notNull();
      t.string('companyId').notNull();
      t.string('action').notNull();
      t.json('details').notNull();
      t.datetimeTz('at').notNull();
      t.index(['companyId', 'at']);
    });
    await builder.createCollection('srmTransitions', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('lifecycle').notNull();
      table.string('recordId').notNull();
      table.string('transition').notNull();
      // Null on the entry runtime.create() writes.
      table.string('from');
      table.string('to').notNull();
      table.string('actorId').notNull();
      table.json('input').notNull().defaultTo({});
      table.datetimeTz('at').notNull();
      table.integer('version').notNull();
      // The caller's request id, as it sent it; null when it sent none.
      table.string('requestId');
      // What a repeated request is found by: the request id, or a key derived
      // from the version for an entry without one. It is never null, so one
      // plain unique index means the same on every dialect, whichever way it
      // treats NULL in a unique index.
      table.string('requestKey').notNull();
      table.index(['lifecycle', 'recordId', 'id']);
      table.unique(['lifecycle', 'recordId', 'version']);
      table.unique(['lifecycle', 'recordId', 'requestKey']);
    });

    await builder.createCollection('srmEffectRuns', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.bigInt('transitionId').notNull();
      table.string('lifecycle').notNull();
      table.string('recordId').notNull();
      table.string('effect').notNull();
      table.boolean('stayBound').notNull();
      table.string('status').notNull();
      table.integer('attempts').notNull().defaultTo(0);
      table.integer('maxAttempts').notNull().defaultTo(1);
      table.json('result');
      table.text('error');
      table.datetimeTz('createdAt').notNull();
      table.datetimeTz('updatedAt').notNull();
      table.datetimeTz('claimedAt');
      table.datetimeTz('runAfter');
      // A continuation the outcome still has to fire, refused so far for a
      // reason a deploy can remove; null when nothing is pending.
      table.json('continuation');
      // When the sweep may try that continuation next: null exactly when
      // nothing is pending, so the sweep finds the due runs without a JSON
      // filter, those due longest first.
      table.datetimeTz('continuationDueAt');
      // When the sweep gave up on that continuation: null unless it did, so
      // an operations page finds those runs, and prune() keeps them, without
      // a JSON filter.
      table.datetimeTz('continuationAbandonedAt');
      table.index(['status', 'id']);
      table.index(['lifecycle', 'recordId', 'id']);
      table.index(['continuationDueAt']);
      table.index(['continuationAbandonedAt']);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('srmEffectRuns');
    await builder.dropCollection('srmTransitions');
    await builder.dropCollection('srmAudit');
    await builder.dropCollection('srmFiles');
    await builder.dropCollection('srmCategories');
    await builder.dropCollection('srmVersions');
    await builder.dropCollection('srmCompanies');
    await builder.alterCollection('user', (t) => { t.dropField('referrerName'); });
  },
});
