import type { LabelConfig, StatusMapping } from '../config.js'
import {
    analyzeExecPlanMarkers,
    execPlanMarker,
    isBlockedPlan,
    renderIssueBody,
    resolvePlanStates,
    type ExecPlan,
    type ExecPlanState,
} from '../domain/execplan.js'
import type {
    IssueContent,
    IssueRepositoryPort,
    IssueSummary,
    IssueUpdate,
    ProjectBoardPort,
    ProjectItemSummary,
} from '../ports/github.js'

export type IssueAction = 'created' | 'updated' | 'unchanged'

export interface SyncOutcome {
    key: string
    issueNumber?: number
    issueAction: IssueAction
    status: string
    statusApplied: boolean
    statusWouldChange: boolean
    addedToProject: boolean
}

export interface OrphanedIssue {
    key: string
    issueNumber: number
    url: string
}

export interface SyncReport {
    outcomes: SyncOutcome[]
    orphanedIssues: OrphanedIssue[]
}

export interface SynchronizerOptions {
    blobBaseUrl: string
    dryRun: boolean
    generator: string
    statuses: StatusMapping
    labels: {
        execplan: LabelConfig
        blocked: LabelConfig
    }
}

function sameLabels(left: string[], right: string[]): boolean {
    const normalize = (labels: string[]): string[] => [...new Set(labels.map((label) => label.toLowerCase()))].sort()
    return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

export class ExecPlanSynchronizer {
    constructor(
        private readonly issues: IssueRepositoryPort,
        private readonly project: ProjectBoardPort,
        private readonly options: SynchronizerOptions,
    ) {}

    async sync(plans: ExecPlan[]): Promise<SyncReport> {
        const states = resolvePlanStates(plans)
        const statusNames = [
            this.options.statuses.backlog,
            this.options.statuses.todo,
            this.options.statuses.inProgress,
            this.options.statuses.done,
        ]

        await this.project.validateStatusOptions(statusNames)

        // Keep GitHub requests serial to reduce secondary-rate-limit pressure.
        const issues = await this.issues.listExecPlanIssues(this.options.labels.execplan.name)
        const items = await this.project.listProjectItems()
        const issuesByKey = this.indexIssues(issues)
        const planKeys = new Set(plans.map((plan) => plan.key))
        const orphanedIssues = [...issuesByKey.entries()]
            .filter(([key]) => !planKeys.has(key))
            .map(([key, issue]) => ({ key, issueNumber: issue.number, url: issue.url }))

        if (!this.options.dryRun) {
            await this.issues.ensureLabels([this.options.labels.execplan, this.options.labels.blocked])
        }

        const outcomes: SyncOutcome[] = []

        for (const plan of plans) {
            const state = states.get(plan.key)

            if (!state) {
                throw new Error(`No resolved state for ${plan.key}`)
            }

            outcomes.push(await this.syncPlan(plan, state, issuesByKey, items))
        }

        return { outcomes, orphanedIssues }
    }

    private indexIssues(issues: IssueSummary[]): Map<string, IssueSummary> {
        const byKey = new Map<string, IssueSummary>()

        for (const issue of issues) {
            const { markers, malformedCandidates } = analyzeExecPlanMarkers(issue.body)
            const hasManagedLabel = issue.labels.some(
                (label) => label.toLowerCase() === this.options.labels.execplan.name.toLowerCase(),
            )

            // The maintainer-controlled label is the authority boundary. Public issue authors
            // can write marker-like text, but they cannot make an issue managed without the label.
            if (!hasManagedLabel) {
                continue
            }

            if (malformedCandidates.length > 0 || markers.length === 0) {
                throw new Error(`Issue #${issue.number} contains an invalid ExecPlan marker`)
            }

            if (markers.length > 1) {
                throw new Error(`Issue #${issue.number} contains multiple ExecPlan markers: ${markers.join(', ')}`)
            }

            const key = markers[0]

            if (!key) {
                continue
            }

            const duplicate = byKey.get(key)

            if (duplicate) {
                throw new Error(
                    `Duplicate ExecPlan marker ${execPlanMarker(key)} on issues #${duplicate.number} and #${issue.number}`,
                )
            }

            byKey.set(key, issue)
        }

        return byKey
    }

    private desiredManagedLabels(plan: ExecPlan): string[] {
        return isBlockedPlan(plan)
            ? [this.options.labels.execplan.name, this.options.labels.blocked.name]
            : [this.options.labels.execplan.name]
    }

    private contentFor(plan: ExecPlan, state: ExecPlanState, existing?: IssueSummary): IssueContent {
        const managedNames = new Set(
            [this.options.labels.execplan.name, this.options.labels.blocked.name].map((label) => label.toLowerCase()),
        )
        const unmanaged = existing?.labels.filter((label) => !managedNames.has(label.toLowerCase())) ?? []
        const status = this.options.statuses[state.status]

        return {
            title: plan.title,
            body: renderIssueBody(plan, state, {
                blobBaseUrl: this.options.blobBaseUrl,
                generator: this.options.generator,
                statusName: status,
            }),
            labels: [...unmanaged, ...this.desiredManagedLabels(plan)],
        }
    }

    private updateFor(existing: IssueSummary, content: IssueContent): IssueUpdate {
        const hasLabel = (labels: string[], name: string): boolean =>
            labels.some((label) => label.toLowerCase() === name.toLowerCase())
        const managedLabels = [this.options.labels.execplan.name, this.options.labels.blocked.name]

        return {
            title: content.title,
            body: content.body,
            labelsToAdd: managedLabels.filter(
                (label) => hasLabel(content.labels, label) && !hasLabel(existing.labels, label),
            ),
            labelsToRemove: managedLabels.filter(
                (label) => !hasLabel(content.labels, label) && hasLabel(existing.labels, label),
            ),
        }
    }

    private async syncPlan(
        plan: ExecPlan,
        state: ExecPlanState,
        issuesByKey: Map<string, IssueSummary>,
        items: ProjectItemSummary[],
    ): Promise<SyncOutcome> {
        const existing = issuesByKey.get(plan.key)
        const status = this.options.statuses[state.status]

        if (!existing) {
            if (this.options.dryRun) {
                return {
                    key: plan.key,
                    issueAction: 'created',
                    status,
                    statusApplied: false,
                    statusWouldChange: true,
                    addedToProject: false,
                }
            }

            const created = await this.issues.createIssue(this.contentFor(plan, state))
            issuesByKey.set(plan.key, created)
            const itemId = await this.project.addIssueToProject(created.number)
            await this.project.setItemStatus(itemId, status)

            return {
                key: plan.key,
                issueNumber: created.number,
                issueAction: 'created',
                status,
                statusApplied: true,
                statusWouldChange: true,
                addedToProject: true,
            }
        }

        const content = this.contentFor(plan, state, existing)
        const issueAction: IssueAction =
            existing.title === content.title &&
            existing.body === content.body &&
            sameLabels(existing.labels, content.labels)
                ? 'unchanged'
                : 'updated'

        if (issueAction === 'updated' && !this.options.dryRun) {
            await this.issues.updateIssue(existing.number, this.updateFor(existing, content))
            existing.title = content.title
            existing.body = content.body
            existing.labels = [...content.labels]
        }

        const item = items.find((candidate) => candidate.contentUrl === existing.url)
        let itemId = item?.id
        let addedToProject = false

        if (!itemId && !this.options.dryRun) {
            itemId = await this.project.addIssueToProject(existing.number)
            items.push({ id: itemId, contentUrl: existing.url })
            addedToProject = true
        }

        const preservesAssignedWork =
            item?.status === this.options.statuses.inProgress &&
            existing.assignees.length > 0 &&
            (status === this.options.statuses.todo || status === this.options.statuses.backlog)
        const statusWouldChange =
            !item || (item.status !== status && item.status !== this.options.statuses.done && !preservesAssignedWork)
        const statusApplied = Boolean(itemId) && statusWouldChange && !this.options.dryRun

        if (statusApplied && itemId) {
            await this.project.setItemStatus(itemId, status)
        }

        return {
            key: plan.key,
            issueNumber: existing.number,
            issueAction,
            status,
            statusApplied,
            statusWouldChange,
            addedToProject: addedToProject || (this.options.dryRun && !item),
        }
    }
}
