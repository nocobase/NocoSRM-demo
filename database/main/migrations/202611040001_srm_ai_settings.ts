import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202611040001_srm_ai_settings',
  async up({ builder }) {
    await builder.createCollection('srmAiSettings', (table) => {
      table.string('id').primary().notNull();
      table.json('values').notNull();
      table.string('updatedBy').notNull();
      table.datetimeTz('updatedAt').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('srmAiSettings');
  },
});
