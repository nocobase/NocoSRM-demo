import { sampleDataToken } from '@nocobase/app-server/sample-data';
import { loadSrmSamples } from '../srm/sample.js';
import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import { SrmService, businessActions } from '../srm/service.js';

export const srmServiceToken = createServiceToken<SrmService>('app/srm');
export default class SrmProvider extends ServiceProvider<Application> {
  readonly name = 'app/srm';
  private jobs?: LifecycleJobs;
  override register(): void {
    this.app.container.singleton(
      srmServiceToken,
      () => new SrmService(this.app),
    );
  }
  override async boot(): Promise<void> {
    this.app.container.resolve(sampleDataToken).register({
      name: 'srm/admission-samples',
      packageName: 'nocosrm-demo',
      run: () => loadSrmSamples(this.app.container.resolve(srmServiceToken)),
    });
    const authz = this.app.container.resolve(authorizationToken);
    authz.settings.add({
      id: 'srm.business',
      title: { key: 'srm.title', ns: 'nocosrm-demo' },
      actions: businessActions.map((name) => ({
        name,
        title: {
          key: `srm.permissions.${name}`,
          ns: 'nocosrm-demo',
        },
      })),
    });
    authz.ui.sections.add({
      name: 'srm',
      order: 20,
      title: { key: 'srm.title', ns: 'nocosrm-demo' },
    });
    authz.ui.sections.add({
      name: 'srm.admission',
      parent: 'srm',
      title: { key: 'srm.title', ns: 'nocosrm-demo' },
    });
    authz.ui.place(
      { type: 'settings', id: 'srm.business' },
      { section: 'srm.admission' },
    );
  }
  override async start(): Promise<void> {
    const service = this.app.container.resolve(srmServiceToken);
    const jobs = this.app.container.resolve(jobExecutorServiceToken);
    this.jobs = createLifecycleJobs({
      jobs: jobs.getJobExecutor('nocosrm-demo'),
      schedule: jobs.getScheduleExecutor('nocosrm-demo'),
      jobName: 'srm/admission-effects',
      sweepEveryMs: 30_000,
      onSweep: async () => {
        await service.approvals.sweep();
      },
    });
    await this.jobs.start(service.runtime);
  }
  override async shutdown(): Promise<void> {
    await this.jobs?.shutdown();
  }
}
