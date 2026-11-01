import {
  Settings,
  Tags,
  Workflow,
  Users,
  ShieldCheck,
  KeyRound,
  ListFilter,
  BrainCircuit,
} from 'lucide-react';
import { modelsRoute } from '@nocobase/app-plugin-agents/client/routes';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/** Register this contribution as business capabilities are developed; keep a bare Home-only application free of settings. */
const systemSettingsRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'settings',
    path: '/settings',
    navigation: { title: 'settings.title', icon: Settings, order: 100 },
    children: [
      {
        ...modelsRoute,
        navigation: { title: 'srm.ai.models', icon: BrainCircuit },
      },
      {
        name: 'srmCategories',
        path: '/categories',
        auth: 'required',
        authz: {
          resource: { type: 'settings', id: 'srm.business' },
          action: 'manageCategories',
        },
        navigation: { title: 'srm.categories', icon: Tags },
        componentLoader: () => import('../srm/categories.js'),
        children: [
          {
            name: 'srmCategoryCreate',
            path: 'new',
            componentLoader: () => import('../srm/category-form.js'),
          },
          {
            name: 'srmCategoryEdit',
            path: ':id',
            componentLoader: () => import('../srm/category-form.js'),
          },
        ],
      },
      {
        name: 'srmWorkflow',
        path: '/workflows',
        auth: 'required',
        authz: {
          resource: { type: 'settings', id: 'srm.business' },
          action: 'inspectWorkflow',
        },
        navigation: { title: 'srm.workflows', icon: Workflow },
        componentLoader: () => import('../srm/workflow.js'),
      },
      {
        name: 'settingsUsers',
        path: '/users',
        auth: 'required',
        authz: { resource: { type: 'user', id: '*' }, action: 'read' },
        navigation: { title: 'settings.users', icon: Users },
        breadcrumb: { title: 'settings.users' },
        componentLoader: () => import('./users.js'),
        children: [
          {
            name: 'settingsUserCreate',
            path: 'create',
            authz: { resource: { type: 'user', id: '*' }, action: 'create' },
            componentLoader: () => import('./user-form.js'),
          },
          {
            name: 'settingsUser',
            path: ':userId',
            componentLoader: () => import('./user-detail.js'),
            children: [
              {
                name: 'settingsUserEdit',
                path: 'edit',
                componentLoader: () => import('./user-form.js'),
              },
            ],
          },
        ],
      },
      {
        name: 'permissionManagement',
        navigation: {
          title: 'settings.permissionManagement',
          icon: ShieldCheck,
        },
        breadcrumb: { title: 'settings.permissionManagement' },
        children: [
          {
            name: 'settingsRoles',
            path: '/roles',
            auth: 'required',
            authz: {
              resource: {
                type: 'settings',
                id: 'authorization.permission-sets',
              },
              action: 'read',
            },
            navigation: { title: 'settings.roles', icon: KeyRound },
            breadcrumb: { title: 'settings.roles' },
            componentLoader: () => import('./roles.js'),
            children: [
              {
                name: 'settingsRoleCreate',
                path: 'create',
                authz: {
                  resource: {
                    type: 'settings',
                    id: 'authorization.permission-sets',
                  },
                  action: 'create',
                },
                breadcrumb: { title: 'settings.newRole' },
                componentLoader: () => import('./role-form.js'),
              },
              {
                name: 'settingsRoleEdit',
                path: ':key/edit',
                breadcrumb: { title: 'settings.editRole' },
                componentLoader: () => import('./role-form.js'),
              },
            ],
          },
          {
            name: 'settingsDefaultAccess',
            path: '/default-access',
            auth: 'required',
            authz: {
              resource: {
                type: 'settings',
                id: 'authorization.default-access',
              },
              action: 'read',
            },
            navigation: {
              title: 'settings.defaultAccess.title',
              icon: ListFilter,
            },
            breadcrumb: { title: 'settings.defaultAccess.title' },
            componentLoader: () => import('./default-access.js'),
            children: [
              {
                name: 'settingsDefaultAccessCreate',
                path: 'create',
                authz: {
                  resource: {
                    type: 'settings',
                    id: 'authorization.default-access',
                  },
                  action: 'create',
                },
                breadcrumb: { title: 'settings.defaultAccess.new' },
                componentLoader: () => import('./default-access-form.js'),
              },
              // Read permission opens the full rule even when the viewer may not update it.
              {
                name: 'settingsDefaultAccessEdit',
                path: ':key/edit',
                breadcrumb: { title: 'settings.defaultAccess.edit' },
                componentLoader: () => import('./default-access-form.js'),
              },
            ],
          },
        ],
      },
    ],
  },
]);
export default systemSettingsRoutes;
