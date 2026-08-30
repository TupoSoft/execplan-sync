import { isAbsolute, posix, resolve, win32 } from 'node:path'
import type { PlanState } from './domain/execplan.js'

export type RunMode = 'validate' | 'sync'

export interface StatusMapping extends Record<PlanState, string> {
    backlog: string
    todo: string
    inProgress: string
    done: string
}

export interface LabelConfig {
    name: string
    color: string
    description: string
}

export interface ExecPlanSyncConfig {
    mode: RunMode
    dryRun: boolean
    workspace: string
    plansDirectory: string
    repository?: string
    sourceRef?: string
    serverUrl: string
    project?: {
        owner: string
        number: number
        statusField: string
        statuses: StatusMapping
    }
    labels: {
        execplan: LabelConfig
        blocked: LabelConfig
    }
    issueGenerator: string
}

export interface RawConfigInput {
    mode?: string | undefined
    dryRun?: string | undefined
    workspace?: string | undefined
    plansDirectory?: string | undefined
    repository?: string | undefined
    sourceRef?: string | undefined
    serverUrl?: string | undefined
    projectOwner?: string | undefined
    projectNumber?: string | undefined
    statusField?: string | undefined
    backlogStatus?: string | undefined
    todoStatus?: string | undefined
    inProgressStatus?: string | undefined
    doneStatus?: string | undefined
    issueGenerator?: string | undefined
}

const DEFAULT_LABELS = {
    execplan: {
        name: 'execplan',
        color: '0E8A16',
        description: 'Generated from an ExecPlan under .agents/plans/',
    },
    blocked: {
        name: 'blocked',
        color: 'B60205',
        description: 'ExecPlan requires a decision or missing evidence',
    },
} as const

function optional(input: string | undefined): string | undefined {
    const value = input?.trim()
    return value ? value : undefined
}

function required(input: string | undefined, name: string): string {
    const value = optional(input)

    if (!value) {
        throw new Error(`${name} is required in sync mode`)
    }

    return value
}

function parseMode(value: string | undefined): RunMode {
    const mode = optional(value) ?? 'sync'

    if (mode !== 'validate' && mode !== 'sync') {
        throw new Error(`mode must be "validate" or "sync", received "${mode}"`)
    }

    return mode
}

function parseBoolean(value: string | undefined, name: string): boolean {
    const normalized = optional(value)?.toLowerCase() ?? 'false'

    if (normalized !== 'true' && normalized !== 'false') {
        throw new Error(`${name} must be "true" or "false", received "${value}"`)
    }

    return normalized === 'true'
}

function parseProjectNumber(value: string): number {
    if (!/^\d+$/.test(value)) {
        throw new Error(`project-number must be a positive integer, received "${value}"`)
    }

    const parsed = Number.parseInt(value, 10)

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`project-number must be a positive integer, received "${value}"`)
    }

    return parsed
}

function validateRepository(value: string): string {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
        throw new Error(`repository must use owner/name form, received "${value}"`)
    }

    return value
}

function validateProjectOwner(value: string): string {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value)) {
        throw new Error(`project-owner is not a valid organization login: "${value}"`)
    }

    return value
}

function validateRelativeDirectory(value: string): string {
    const normalized = value.replace(/\\/g, '/')
    const canonical = posix.normalize(normalized)

    if (isAbsolute(value) || win32.isAbsolute(value)) {
        throw new Error('plans-directory must be repository-relative')
    }

    if (canonical === '.' || canonical === '..' || canonical.startsWith('../')) {
        throw new Error('plans-directory must stay inside the repository workspace')
    }

    return canonical
}

function validateServerUrl(value: string): string {
    let url: URL

    try {
        url = new URL(value)
    } catch {
        throw new Error(`server-url must be an absolute URL, received "${value}"`)
    }

    const localHttp = url.protocol === 'http:' && url.hostname === 'localhost'

    if (url.protocol !== 'https:' && !localHttp) {
        throw new Error('server-url must use HTTPS unless the host is localhost')
    }

    return url.toString().replace(/\/$/, '')
}

function validateStatusMapping(statuses: StatusMapping): StatusMapping {
    const entries: Array<[PlanState, string]> = [
        ['backlog', statuses.backlog],
        ['todo', statuses.todo],
        ['inProgress', statuses.inProgress],
        ['done', statuses.done],
    ]

    for (const [state, name] of entries) {
        if (!name.trim()) {
            throw new Error(`${state}-status must not be empty`)
        }
    }

    const names = entries.map(([, name]) => name)

    if (new Set(names).size !== names.length) {
        throw new Error('Project status option names must be distinct')
    }

    return statuses
}

export function resolveConfig(
    raw: RawConfigInput,
    environment: NodeJS.ProcessEnv = process.env,
    currentDirectory = process.cwd(),
): ExecPlanSyncConfig {
    const mode = parseMode(raw.mode)
    const workspace = resolve(optional(raw.workspace) ?? optional(environment.GITHUB_WORKSPACE) ?? currentDirectory)
    const plansDirectory = validateRelativeDirectory(
        optional(raw.plansDirectory) ?? optional(environment.PLANS_DIR) ?? '.agents/plans',
    )
    const serverUrl = validateServerUrl(
        optional(raw.serverUrl) ?? optional(environment.GITHUB_SERVER_URL) ?? 'https://github.com',
    )
    const issueGenerator = optional(raw.issueGenerator) ?? 'execplan-sync'

    const base: Omit<ExecPlanSyncConfig, 'project' | 'repository' | 'sourceRef'> = {
        mode,
        dryRun: parseBoolean(optional(raw.dryRun) ?? environment.PLANS_DRY_RUN, 'dry-run'),
        workspace,
        plansDirectory,
        serverUrl,
        labels: {
            execplan: { ...DEFAULT_LABELS.execplan },
            blocked: { ...DEFAULT_LABELS.blocked },
        },
        issueGenerator,
    }

    if (mode === 'validate') {
        return base
    }

    const repository = validateRepository(
        required(optional(raw.repository) ?? environment.GITHUB_REPOSITORY, 'repository'),
    )
    const sourceRef = required(
        optional(raw.sourceRef) ??
            optional(environment.PLANS_BRANCH) ??
            optional(environment.GITHUB_REF_NAME) ??
            optional(environment.GITHUB_SHA),
        'source-ref',
    )
    const projectOwner = validateProjectOwner(
        required(optional(raw.projectOwner) ?? environment.PLANS_PROJECT_OWNER, 'project-owner'),
    )
    const projectNumber = parseProjectNumber(
        required(optional(raw.projectNumber) ?? environment.PLANS_PROJECT_NUMBER, 'project-number'),
    )
    const statusField = required(optional(raw.statusField) ?? 'Status', 'status-field')
    const statuses = validateStatusMapping({
        backlog: optional(raw.backlogStatus) ?? 'Backlog',
        todo: optional(raw.todoStatus) ?? 'Todo',
        inProgress: optional(raw.inProgressStatus) ?? 'In Progress',
        done: optional(raw.doneStatus) ?? 'Done',
    })

    return {
        ...base,
        repository,
        sourceRef,
        project: {
            owner: projectOwner,
            number: projectNumber,
            statusField,
            statuses,
        },
    }
}

export function blobBaseUrl(config: ExecPlanSyncConfig): string {
    if (!config.repository || !config.sourceRef) {
        throw new Error('repository and source-ref are required to render synchronized issue links')
    }

    return `${config.serverUrl}/${config.repository}/blob/${encodeURIComponent(config.sourceRef)}`
}
