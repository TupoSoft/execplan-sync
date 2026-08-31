import { blobBaseUrl, resolveConfig, type RawConfigInput } from '../src/config.js'

const VALID_SYNC_INPUT: RawConfigInput = {
    mode: 'sync',
    dryRun: 'false',
    workspace: '/input/workspace',
    plansDirectory: 'input/plans',
    repository: 'InputOrg/InputRepo',
    sourceRef: 'input/branch',
    serverUrl: 'https://github.input.test',
    projectOwner: 'InputOrg',
    projectNumber: '42',
}

function syncInput(overrides: RawConfigInput = {}): RawConfigInput {
    return { ...VALID_SYNC_INPUT, ...overrides }
}

describe('configuration resolution', (): void => {
    it('prefers explicit inputs over environment values', (): void => {
        const environment: NodeJS.ProcessEnv = {
            GITHUB_WORKSPACE: '/environment/workspace',
            PLANS_DIR: 'environment/plans',
            PLANS_DRY_RUN: 'true',
            GITHUB_SERVER_URL: 'https://github.environment.test',
            GITHUB_REPOSITORY: 'EnvironmentOrg/EnvironmentRepo',
            PLANS_BRANCH: 'environment/branch',
            PLANS_PROJECT_OWNER: 'EnvironmentOrg',
            PLANS_PROJECT_NUMBER: '7',
        }

        const config = resolveConfig(
            syncInput({
                dryRun: ' FALSE ',
                workspace: ' /input/workspace ',
                plansDirectory: ' input/plans ',
                repository: ' InputOrg/InputRepo ',
                sourceRef: ' feature/input ',
                serverUrl: ' https://github.input.test/ ',
                projectOwner: ' InputOrg ',
                projectNumber: ' 42 ',
                statusField: ' Workflow ',
                backlogStatus: ' Planned ',
                todoStatus: ' Queued ',
                inProgressStatus: ' Active ',
                doneStatus: ' Complete ',
                issueGenerator: ' shared-action ',
            }),
            environment,
            '/current/repository',
        )

        expect(config).toMatchObject({
            mode: 'sync',
            dryRun: false,
            workspace: '/input/workspace',
            plansDirectory: 'input/plans',
            repository: 'InputOrg/InputRepo',
            sourceRef: 'feature/input',
            serverUrl: 'https://github.input.test',
            issueGenerator: 'shared-action',
            project: {
                owner: 'InputOrg',
                number: 42,
                statusField: 'Workflow',
                statuses: {
                    backlog: 'Planned',
                    todo: 'Queued',
                    inProgress: 'Active',
                    done: 'Complete',
                },
            },
        })
        expect(blobBaseUrl(config)).toBe('https://github.input.test/InputOrg/InputRepo/blob/feature%2Finput')
    })

    it('uses environment fallbacks in their documented order', (): void => {
        const config = resolveConfig(
            { mode: 'sync' },
            {
                GITHUB_WORKSPACE: '/environment/workspace',
                PLANS_DIR: 'environment/plans',
                PLANS_DRY_RUN: 'TRUE',
                GITHUB_SERVER_URL: 'https://github.environment.test/',
                GITHUB_REPOSITORY: 'EnvironmentOrg/EnvironmentRepo',
                PLANS_BRANCH: 'plans/branch',
                GITHUB_REF_NAME: 'event-branch',
                GITHUB_SHA: 'deadbeef',
                PLANS_PROJECT_OWNER: 'EnvironmentOrg',
                PLANS_PROJECT_NUMBER: '17',
            },
            '/current/repository',
        )

        expect(config).toMatchObject({
            mode: 'sync',
            dryRun: true,
            workspace: '/environment/workspace',
            plansDirectory: 'environment/plans',
            repository: 'EnvironmentOrg/EnvironmentRepo',
            sourceRef: 'plans/branch',
            serverUrl: 'https://github.environment.test',
            issueGenerator: 'execplan-sync',
            project: {
                owner: 'EnvironmentOrg',
                number: 17,
                statusField: 'Status',
                statuses: {
                    backlog: 'Backlog',
                    todo: 'Todo',
                    inProgress: 'In Progress',
                    done: 'Done',
                },
            },
        })
    })

    it('keeps validate mode independent of synchronization credentials', (): void => {
        const config = resolveConfig(
            { mode: 'validate', dryRun: 'true' },
            {
                GITHUB_REPOSITORY: 'not valid',
                PLANS_PROJECT_NUMBER: 'zero',
            },
            '/current/repository',
        )

        expect(config).toMatchObject({
            mode: 'validate',
            dryRun: true,
            workspace: '/current/repository',
            plansDirectory: '.agents/plans',
            serverUrl: 'https://github.com',
        })
        expect(config.repository).toBeUndefined()
        expect(config.project).toBeUndefined()
    })

    it('rejects invalid scalar and synchronization values', (): void => {
        expect(() => resolveConfig({ mode: 'publish' }, {}, '/repo')).toThrow('mode must be "validate" or "sync"')
        expect(() => resolveConfig(syncInput({ dryRun: 'sometimes' }), {})).toThrow('dry-run must be "true" or "false"')
        expect(() => resolveConfig(syncInput({ repository: 'missing-repository-owner' }), {})).toThrow(
            'repository must use owner/name form',
        )
        expect(() => resolveConfig(syncInput({ projectOwner: '_invalid' }), {})).toThrow(
            'project-owner is not a valid organization login',
        )
        expect(() => resolveConfig(syncInput({ projectNumber: '0' }), {})).toThrow(
            'project-number must be a positive integer',
        )
        expect(() => resolveConfig(syncInput({ projectNumber: '1.5' }), {})).toThrow(
            'project-number must be a positive integer',
        )
        expect(() => resolveConfig(syncInput({ serverUrl: 'http://github.example.test' }), {})).toThrow(
            'server-url must use HTTPS unless the host is localhost',
        )
        expect(() => resolveConfig(syncInput({ serverUrl: 'ftp://localhost' }), {})).toThrow(
            'server-url must use HTTPS unless the host is localhost',
        )
        expect(() => resolveConfig(syncInput({ backlogStatus: 'Todo' }), {})).toThrow(
            'Project status option names must be distinct',
        )
        expect(() => resolveConfig(syncInput({ sourceRef: ' ' }), {})).toThrow('source-ref is required in sync mode')
    })

    it.each([
        '/absolute/plans',
        'C:\\absolute\\plans',
        '../outside',
        '..\\outside',
        'plans/../../outside',
        'plans\\..\\..\\outside',
    ])('rejects plans-directory traversal: %s', (plansDirectory): void => {
        expect(() => resolveConfig(syncInput({ plansDirectory }), {})).toThrow(/plans-directory must/)
    })
})
