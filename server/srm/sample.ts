import { randomUUID } from 'node:crypto';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { profileSchema } from './schema.js';
import type { SrmService } from './service.js';

/** Optional local sample content; never executes as required installation data. */
export async function loadSrmSamples(service: SrmService): Promise<void> {
  const app = service.app;
  const users = app.container.resolve(userAdministrationServiceToken);
  const sets = app.container.resolve(authorizationToken).permissionSets;
  const password = '12345678';
  const account = async (email: string, name: string) => {
    const existing = (
      await users.list({ page: 1, pageSize: 100, search: email })
    ).items.find((user) => user.email === email);
    return existing ?? users.create({ email, name, password });
  };
  const manager = await account('manager@srm.test', '采购经理（测试）');
  if (
    !(await sets.listAssignments('srm-procurement')).some(
      (a) => a.subject.id === manager.id,
    )
  )
    await sets.assign({
      permissionSet: 'srm-procurement',
      subject: { type: 'user', id: manager.id },
    });
  const categories = [
    {
      id: '8c5cf200-0d40-4b3c-8a0f-01e4d085b001',
      name: '机械设备',
      nameEn: 'Machinery',
    },
    {
      id: '8c5cf200-0d40-4b3c-8a0f-01e4d085b002',
      name: '电子元器件',
      nameEn: 'Electronic components',
    },
    {
      id: '8c5cf200-0d40-4b3c-8a0f-01e4d085b003',
      name: '办公用品',
      nameEn: 'Office supplies',
    },
  ];
  for (const category of categories)
    if (
      !(await service.db
        .repository('srmCategories')
        .exists({ filter: { id: category.id } }))
    )
      await service.db
        .repository('srmCategories')
        .createOne({ values: { ...category, active: true, revision: 0 } });
  for (const [index, state] of [
    'draft',
    'pending',
    'rejected',
    'approved',
  ].entries()) {
    const owner = await account(`${state}@srm.test`, `测试供应商 · ${state}`);
    if (
      !(await sets.listAssignments('srm-supplier')).some(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === owner.id,
      )
    )
      await sets.assign({
        permissionSet: 'srm-supplier',
        subject: { type: 'user', id: owner.id },
      });
    if (await service.own(owner.id)) continue;
    const legalName = [
      '华辰精密制造有限公司',
      '启明电子科技有限公司',
      '远航工业服务有限公司',
      '晨星办公用品有限公司',
    ][index];
    if (state === 'draft') {
      await service.db.transaction((tx) =>
        service.save(
          owner.id,
          profileSchema.parse({ legalName, referrerName: '张明' }),
          0,
          `sample-${randomUUID()}`,
          tx,
        ),
      );
      continue;
    }
    const files = app.container
      .resolve(serverFileRepositoryManagerToken)
      .repository('srmFiles', {
        disk: 'local',
        accessPath: '/api/srm/files',
        policy: {
          read: true,
          create: { scope: true, defaults: { ownerId: owner.id } },
          update: false,
          delete: false,
        },
      });
    const file = await files.uploadOne({
      file: new File([sampleLicense()], 'sample-business-license.pdf', {
        type: 'application/pdf',
      }),
    });
    const profile = profileSchema.parse({
      legalName,
      creditCode: `91350211M000100Y4${index}`,
      address: '上海市浦东新区示范路 100 号',
      introduction: '用于演示入驻流程的虚构企业资料。',
      categories: [categories[index % categories.length].id],
      products: [
        '',
        '电子元器件及配套服务',
        '工业设备维护与技术服务',
        '办公用品及耗材',
      ][index],
      contactName: ['', '李晓', '王宁', '陈晨'][index],
      phone: `1380013800${index}`,
      contactEmail: `contact-${index}@example.test`,
      referrerName: index === 2 ? '' : '张明',
      attachments: [
        { id: file.record.id, kind: 'license', name: '营业执照（测试资料）' },
      ],
    });
    let company = await service.db.transaction((tx) =>
      service.save(owner.id, profile, 0, `sample-${randomUUID()}`, tx),
    );
    company = await service.db.transaction((tx) =>
      service.submit(
        owner.id,
        company.lifecycleVersion,
        `sample-${randomUUID()}`,
        tx,
      ),
    );
    if (state === 'rejected' || state === 'approved') {
      const detail = await service.detail(manager.id, company.id);
      const offered = detail.actions[0];
      if (!offered?.contentHash)
        throw new Error('Sample admission has no review task.');
      await service.approvals.perform({
        action: state === 'approved' ? 'approve' : 'reject',
        target: { taskId: offered.task.id },
        actor: { id: manager.id },
        contentHash: offered.contentHash,
        comment:
          state === 'approved'
            ? '资料完整，准予入驻。'
            : '请补充主要服务范围与行业资质后重新提交。',
        requestId: `sample-${randomUUID()}`,
      });
    }
  }
}

function sampleLicense(): string {
  const stream =
    'BT /F1 18 Tf 50 760 Td (SAMPLE BUSINESS LICENSE) Tj 0 -30 Td /F1 11 Tf (Fictional UI test data. Not a legal qualification.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
      .join('');
  return (
    pdf +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  );
}
