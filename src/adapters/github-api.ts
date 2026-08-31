import { getOctokit } from '@actions/github'
import type { LabelConfig } from '../config.js'
import type {
    IssueContent,
    IssueRepositoryPort,
    IssueSummary,
    IssueUpdate,
    ProjectBoardPort,
    ProjectItemSummary,
} from '../ports/github.js'

const DOTCOM_API_VERSION = '2026-03-10'
const GHES_API_VERSION = '2022-11-28'
const DEFAULT_MUTATION_INTERVAL_MS = 1_000
const DEFAULT_RATE_LIMIT_RETRIES = 2
const RATE_LIMIT_FALLBACK_MS = 60_000
const MAX_AUTOMATIC_RATE_LIMIT_DELAY_MS = 5 * 60_000

export type GitHubClient = ReturnType<typeof getOctokit>

export interface GitHubApiOptions {
    repository: string
    projectOwner: string
    projectNumber: number
    statusField: string
    apiVersion?: string
}

export interface GitHubApiRuntime {
    now?: () => number
    sleep?: (milliseconds: number) => Promise<void>
    mutationIntervalMs?: number
    maxRateLimitRetries?: number
}

interface ProjectField {
    id: number
    name: string
    data_type: string
    options?: Array<{ id: string; name: { raw: string } }>
}

interface ProjectItem {
    id: number
    content_type?: string
    content?: {
        html_url?: string
        number?: number
        repository?: { full_name?: string }
    }
    fields?: Array<{
        id: number
        name: string
        value?: { id?: string; name?: { raw?: string } }
    }>
}

interface StatusMetadata {
    fieldId: number
    optionIds: Map<string, string>
}

interface ResolvedRuntime {
    now: () => number
    sleep: (milliseconds: number) => Promise<void>
    mutationIntervalMs: number
    maxRateLimitRetries: number
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

interface RateLimitDelay {
    milliseconds: number
    authoritative: boolean
}

function boundedRateLimitDelay(milliseconds: number, authoritative: boolean): RateLimitDelay | undefined {
    const delay = Math.max(milliseconds, 1_000)

    return delay <= MAX_AUTOMATIC_RATE_LIMIT_DELAY_MS ? { milliseconds: delay, authoritative } : undefined
}

function rateLimitDelay(error: unknown, now: number): RateLimitDelay | undefined {
    const errorRecord = asRecord(error)
    const status = errorRecord?.status

    if (status !== 403 && status !== 429) {
        return undefined
    }

    const response = asRecord(errorRecord?.response)
    const headers = asRecord(response?.headers)
    const retryAfterSeconds = Number(headers?.['retry-after'])

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
        return boundedRateLimitDelay(retryAfterSeconds * 1_000, true)
    }

    if (String(headers?.['x-ratelimit-remaining']) === '0') {
        const resetSeconds = Number(headers?.['x-ratelimit-reset'])

        if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
            return boundedRateLimitDelay(resetSeconds * 1_000 - now, true)
        }
    }

    const responseData = asRecord(response?.data)
    const errorMessage = typeof errorRecord?.message === 'string' ? errorRecord.message : ''
    const responseMessage = typeof responseData?.message === 'string' ? responseData.message : ''
    const message = `${errorMessage} ${responseMessage}`

    if (status === 429 || /(?:secondary )?rate limit/i.test(message)) {
        return { milliseconds: RATE_LIMIT_FALLBACK_MS, authoritative: false }
    }

    return undefined
}

export function projectApiVersion(serverUrl: string): string {
    return new URL(serverUrl).hostname === 'github.com' ? DOTCOM_API_VERSION : GHES_API_VERSION
}

function splitRepository(repository: string): { owner: string; repo: string } {
    const [owner, repo] = repository.split('/')

    if (!owner || !repo) {
        throw new Error(`Invalid repository ${repository}`)
    }

    return { owner, repo }
}

function labelNames(labels: Array<string | { name?: string | null }>): string[] {
    return labels.flatMap((label) => {
        if (typeof label === 'string') {
            return [label]
        }

        return label.name ? [label.name] : []
    })
}

export class GitHubApi implements IssueRepositoryPort, ProjectBoardPort {
    private readonly repository: { owner: string; repo: string }
    private readonly apiVersion: string
    private readonly runtime: ResolvedRuntime
    private lastMutationAt?: number
    private statusMetadata?: StatusMetadata

    constructor(
        private readonly octokit: GitHubClient,
        private readonly options: GitHubApiOptions,
        runtime: GitHubApiRuntime = {},
    ) {
        this.repository = splitRepository(options.repository)
        this.apiVersion = options.apiVersion ?? DOTCOM_API_VERSION
        this.runtime = {
            now: runtime.now ?? Date.now,
            sleep:
                runtime.sleep ??
                ((milliseconds): Promise<void> =>
                    new Promise((resolve) => {
                        setTimeout(resolve, milliseconds)
                    })),
            mutationIntervalMs: runtime.mutationIntervalMs ?? DEFAULT_MUTATION_INTERVAL_MS,
            maxRateLimitRetries: runtime.maxRateLimitRetries ?? DEFAULT_RATE_LIMIT_RETRIES,
        }
    }

    private async mutate<T>(operation: () => Promise<T>): Promise<T> {
        let retries = 0

        while (true) {
            if (this.lastMutationAt !== undefined) {
                const remaining = this.runtime.mutationIntervalMs - (this.runtime.now() - this.lastMutationAt)

                if (remaining > 0) {
                    await this.runtime.sleep(remaining)
                }
            }

            this.lastMutationAt = this.runtime.now()

            try {
                return await operation()
            } catch (error: unknown) {
                const delay = rateLimitDelay(error, this.runtime.now())

                if (delay === undefined || retries >= this.runtime.maxRateLimitRetries) {
                    throw error
                }

                const wait = delay.authoritative
                    ? delay.milliseconds
                    : Math.min(delay.milliseconds * 2 ** retries, MAX_AUTOMATIC_RATE_LIMIT_DELAY_MS)
                retries += 1
                await this.runtime.sleep(wait)
            }
        }
    }

    async ensureLabels(labels: LabelConfig[]): Promise<void> {
        const existing = new Map<string, { name: string; color: string; description: string | null }>()

        for await (const response of this.octokit.paginate.iterator(this.octokit.rest.issues.listLabelsForRepo, {
            ...this.repository,
            per_page: 100,
        })) {
            for (const label of response.data) {
                existing.set(label.name.toLowerCase(), {
                    name: label.name,
                    color: label.color,
                    description: label.description,
                })
            }
        }

        for (const label of labels) {
            const current = existing.get(label.name.toLowerCase())

            if (!current) {
                await this.mutate(() =>
                    this.octokit.rest.issues.createLabel({
                        ...this.repository,
                        name: label.name,
                        color: label.color,
                        description: label.description,
                    }),
                )
                continue
            }

            if (
                current.name !== label.name ||
                current.color.toLowerCase() !== label.color.toLowerCase() ||
                current.description !== label.description
            ) {
                await this.mutate(() =>
                    this.octokit.rest.issues.updateLabel({
                        ...this.repository,
                        name: current.name,
                        new_name: label.name,
                        color: label.color,
                        description: label.description,
                    }),
                )
            }
        }
    }

    async listExecPlanIssues(execplanLabel: string): Promise<IssueSummary[]> {
        const issues: IssueSummary[] = []

        // Fetch all issues so label matching remains case-insensitive, but trust only issues
        // carrying the maintainer-controlled managed label. Marker text alone is user-controlled.
        for await (const response of this.octokit.paginate.iterator(this.octokit.rest.issues.listForRepo, {
            ...this.repository,
            state: 'all',
            per_page: 100,
        })) {
            for (const issue of response.data) {
                const labels = labelNames(issue.labels)
                const hasManagedLabel = labels.some((label) => label.toLowerCase() === execplanLabel.toLowerCase())

                if ('pull_request' in issue || !hasManagedLabel) {
                    continue
                }

                issues.push({
                    number: issue.number,
                    url: issue.html_url,
                    title: issue.title,
                    body: issue.body ?? '',
                    assignees: issue.assignees?.map((assignee) => assignee.login) ?? [],
                    labels,
                })
            }
        }

        return issues
    }

    async createIssue(content: IssueContent): Promise<IssueSummary> {
        const { data } = await this.mutate(() =>
            this.octokit.rest.issues.create({
                ...this.repository,
                title: content.title,
                body: content.body,
                labels: content.labels,
            }),
        )

        return {
            number: data.number,
            url: data.html_url,
            title: data.title,
            body: data.body ?? '',
            assignees: data.assignees?.map((assignee) => assignee.login) ?? [],
            labels: labelNames(data.labels),
        }
    }

    async updateIssue(issueNumber: number, update: IssueUpdate): Promise<void> {
        await this.mutate(() =>
            this.octokit.rest.issues.update({
                ...this.repository,
                issue_number: issueNumber,
                title: update.title,
                body: update.body,
            }),
        )

        if (update.labelsToAdd.length > 0) {
            await this.mutate(() =>
                this.octokit.rest.issues.addLabels({
                    ...this.repository,
                    issue_number: issueNumber,
                    labels: update.labelsToAdd,
                }),
            )
        }

        for (const label of update.labelsToRemove) {
            try {
                await this.mutate(() =>
                    this.octokit.rest.issues.removeLabel({
                        ...this.repository,
                        issue_number: issueNumber,
                        name: label,
                    }),
                )
            } catch (error: unknown) {
                const status =
                    typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined

                if (status !== 404) {
                    throw error
                }
            }
        }
    }

    async validateStatusOptions(statuses: string[]): Promise<void> {
        const { optionIds } = await this.resolveStatusMetadata()
        const missing = statuses.filter((status) => !optionIds.has(status))

        if (missing.length > 0) {
            throw new Error(
                `Project ${this.options.projectOwner}/${this.options.projectNumber} ${this.options.statusField} is missing: ${missing.join(', ')}`,
            )
        }
    }

    async listProjectItems(): Promise<ProjectItemSummary[]> {
        const { fieldId } = await this.resolveStatusMetadata()
        const items: ProjectItemSummary[] = []

        for await (const response of this.octokit.paginate.iterator<ProjectItem>(
            'GET /orgs/{org}/projectsV2/{project_number}/items',
            {
                org: this.options.projectOwner,
                project_number: this.options.projectNumber,
                fields: String(fieldId),
                q: `repo:${this.options.repository}`,
                per_page: 100,
                headers: { 'x-github-api-version': this.apiVersion },
            },
        )) {
            for (const item of response.data) {
                const status = item.fields?.find((field) => field.id === fieldId)?.value?.name?.raw
                items.push({
                    id: String(item.id),
                    ...(item.content?.html_url ? { contentUrl: item.content.html_url } : {}),
                    ...(status ? { status } : {}),
                })
            }
        }

        return items
    }

    async addIssueToProject(issueNumber: number): Promise<string> {
        const response = await this.mutate(() =>
            this.octokit.request('POST /orgs/{org}/projectsV2/{project_number}/items', {
                org: this.options.projectOwner,
                project_number: this.options.projectNumber,
                type: 'Issue',
                owner: this.repository.owner,
                repo: this.repository.repo,
                number: issueNumber,
                headers: { 'x-github-api-version': this.apiVersion },
            }),
        )
        const data = response.data as ProjectItem

        return String(data.id)
    }

    async setItemStatus(itemId: string, status: string): Promise<void> {
        const { fieldId, optionIds } = await this.resolveStatusMetadata()
        const optionId = optionIds.get(status)

        if (!optionId) {
            throw new Error(`Status option "${status}" does not exist on the project`)
        }

        await this.mutate(() =>
            this.octokit.request('PATCH /orgs/{org}/projectsV2/{project_number}/items/{item_id}', {
                org: this.options.projectOwner,
                project_number: this.options.projectNumber,
                item_id: Number.parseInt(itemId, 10),
                fields: [{ id: fieldId, value: optionId }],
                headers: { 'x-github-api-version': this.apiVersion },
            }),
        )
    }

    private async resolveStatusMetadata(): Promise<StatusMetadata> {
        if (this.statusMetadata) {
            return this.statusMetadata
        }

        let statusField: ProjectField | undefined

        for await (const response of this.octokit.paginate.iterator<ProjectField>(
            'GET /orgs/{org}/projectsV2/{project_number}/fields',
            {
                org: this.options.projectOwner,
                project_number: this.options.projectNumber,
                per_page: 100,
                headers: { 'x-github-api-version': this.apiVersion },
            },
        )) {
            statusField = response.data.find((field) => field.name === this.options.statusField) ?? statusField
        }

        if (!statusField) {
            throw new Error(
                `Project ${this.options.projectOwner}/${this.options.projectNumber} has no ${this.options.statusField} field`,
            )
        }

        if (statusField.data_type !== 'single_select' || !statusField.options) {
            throw new Error(`Project field ${this.options.statusField} must be a single-select field`)
        }

        this.statusMetadata = {
            fieldId: statusField.id,
            optionIds: new Map(statusField.options.map((option) => [option.name.raw, option.id])),
        }

        return this.statusMetadata
    }
}

export function createGitHubClient(token: string, apiVersion = DOTCOM_API_VERSION): GitHubClient {
    return getOctokit(token, {
        request: {
            headers: {
                accept: 'application/vnd.github+json',
                'x-github-api-version': apiVersion,
            },
        },
    })
}
