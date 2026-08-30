import type { LabelConfig } from '../src/config.js'
import { ExecPlanSynchronizer, type SynchronizerOptions } from '../src/application/synchronizer.js'
import {
    execPlanMarker,
    parseExecPlan,
    renderIssueBody,
    resolvePlanStates,
    type ExecPlan,
} from '../src/domain/execplan.js'
import type {
    IssueContent,
    IssueRepositoryPort,
    IssueSummary,
    IssueUpdate,
    ProjectBoardPort,
    ProjectItemSummary,
} from '../src/ports/github.js'
import { buildPlanFile, type PlanFixtureOptions } from './fixtures.js'

const BASE_OPTIONS: SynchronizerOptions = {
    blobBaseUrl: 'https://github.com/TupoSoft/LeadEmailFinder/blob/master',
    dryRun: false,
    generator: 'pnpm plans:sync',
    statuses: {
        backlog: 'Backlog',
        todo: 'Todo',
        inProgress: 'In Progress',
        done: 'Done',
    },
    labels: {
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
    },
}

function synchronizerOptions(dryRun = false): SynchronizerOptions {
    return {
        ...BASE_OPTIONS,
        dryRun,
        statuses: { ...BASE_OPTIONS.statuses },
        labels: {
            execplan: { ...BASE_OPTIONS.labels.execplan },
            blocked: { ...BASE_OPTIONS.labels.blocked },
        },
    }
}

function buildPlan(
    path = '.agents/plans/payments/01-idempotent-credit-grants.md',
    options: PlanFixtureOptions = {},
): ExecPlan {
    return parseExecPlan(path, buildPlanFile(options))
}

function renderedBody(plan: ExecPlan, allPlans: ExecPlan[] = [plan]): string {
    const state = resolvePlanStates(allPlans).get(plan.key)

    if (!state) {
        throw new Error(`No state for ${plan.key}`)
    }

    return renderIssueBody(plan, state, {
        blobBaseUrl: BASE_OPTIONS.blobBaseUrl,
        generator: BASE_OPTIONS.generator,
        statusName: BASE_OPTIONS.statuses[state.status],
    })
}

function existingIssue(
    plan: ExecPlan,
    overrides: Partial<IssueSummary> = {},
    allPlans: ExecPlan[] = [plan],
): IssueSummary {
    return {
        number: 42,
        url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/42',
        title: plan.title,
        body: renderedBody(plan, allPlans),
        assignees: [],
        labels: ['execplan'],
        ...overrides,
    }
}

function copyContent(content: IssueContent): IssueContent {
    return { ...content, labels: [...content.labels] }
}

function copyUpdate(update: IssueUpdate): IssueUpdate {
    return {
        ...update,
        labelsToAdd: [...update.labelsToAdd],
        labelsToRemove: [...update.labelsToRemove],
    }
}

class FakeIssueRepository implements IssueRepositoryPort {
    readonly ensuredLabels: LabelConfig[][] = []
    readonly created: IssueContent[] = []
    readonly updated: Array<{ issueNumber: number; update: IssueUpdate }> = []
    listCalls = 0

    constructor(
        readonly issues: IssueSummary[] = [],
        private readonly events: string[] = [],
    ) {}

    ensureLabels(labels: LabelConfig[]): Promise<void> {
        this.events.push('issues.ensureLabels')
        this.ensuredLabels.push(labels.map((label) => ({ ...label })))
        return Promise.resolve()
    }

    listExecPlanIssues(execplanLabel: string): Promise<IssueSummary[]> {
        this.events.push(`issues.list:${execplanLabel}`)
        this.listCalls += 1
        return Promise.resolve([...this.issues])
    }

    createIssue(content: IssueContent): Promise<IssueSummary> {
        this.events.push('issues.create')
        const recorded = copyContent(content)
        this.created.push(recorded)
        const issue: IssueSummary = {
            number: 100 + this.created.length,
            url: `https://github.com/TupoSoft/LeadEmailFinder/issues/${100 + this.created.length}`,
            title: recorded.title,
            body: recorded.body,
            assignees: [],
            labels: [...recorded.labels],
        }
        this.issues.push(issue)
        return Promise.resolve(issue)
    }

    updateIssue(issueNumber: number, update: IssueUpdate): Promise<void> {
        this.events.push(`issues.update:${issueNumber}`)
        this.updated.push({ issueNumber, update: copyUpdate(update) })
        return Promise.resolve()
    }
}

class FakeProjectBoard implements ProjectBoardPort {
    readonly validatedStatuses: string[][] = []
    readonly addedIssueNumbers: number[] = []
    readonly statusWrites: Array<{ itemId: string; status: string }> = []
    listCalls = 0

    constructor(
        readonly items: ProjectItemSummary[] = [],
        private readonly events: string[] = [],
        private readonly validationError?: Error,
    ) {}

    validateStatusOptions(statuses: string[]): Promise<void> {
        this.events.push('project.validateStatusOptions')
        this.validatedStatuses.push([...statuses])

        return this.validationError ? Promise.reject(this.validationError) : Promise.resolve()
    }

    listProjectItems(): Promise<ProjectItemSummary[]> {
        this.events.push('project.listItems')
        this.listCalls += 1
        return Promise.resolve([...this.items])
    }

    addIssueToProject(issueNumber: number): Promise<string> {
        this.events.push('project.addIssue')
        this.addedIssueNumbers.push(issueNumber)
        return Promise.resolve(`item-${this.addedIssueNumbers.length}`)
    }

    setItemStatus(itemId: string, status: string): Promise<void> {
        this.events.push(`project.setStatus:${status}`)
        this.statusWrites.push({ itemId, status })
        return Promise.resolve()
    }
}

function expectNoMutations(issues: FakeIssueRepository, project: FakeProjectBoard): void {
    expect(issues.ensuredLabels).toHaveLength(0)
    expect(issues.created).toHaveLength(0)
    expect(issues.updated).toHaveLength(0)
    expect(project.addedIssueNumbers).toHaveLength(0)
    expect(project.statusWrites).toHaveLength(0)
}

describe('ExecPlanSynchronizer', (): void => {
    it('creates a missing issue, adds it to the project, and applies its mapped status after preflight', async (): Promise<void> => {
        const events: string[] = []
        const issues = new FakeIssueRepository([], events)
        const project = new FakeProjectBoard([], events)
        const plan = buildPlan()

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([plan])

        expect(project.validatedStatuses).toEqual([['Backlog', 'Todo', 'In Progress', 'Done']])
        expect(issues.ensuredLabels).toEqual([[BASE_OPTIONS.labels.execplan, BASE_OPTIONS.labels.blocked]])
        expect(issues.created).toHaveLength(1)
        expect(issues.created[0]).toMatchObject({
            title: plan.title,
            labels: ['execplan'],
        })
        expect(issues.created[0]?.body).toBe(renderedBody(plan))
        expect(project.addedIssueNumbers).toEqual([101])
        expect(project.statusWrites).toEqual([{ itemId: 'item-1', status: 'Todo' }])
        expect(report).toEqual({
            outcomes: [
                {
                    key: 'payments/01',
                    issueNumber: 101,
                    issueAction: 'created',
                    status: 'Todo',
                    statusApplied: true,
                    statusWouldChange: true,
                    addedToProject: true,
                },
            ],
            orphanedIssues: [],
        })
        expect(events).toEqual([
            'project.validateStatusOptions',
            'issues.list:execplan',
            'project.listItems',
            'issues.ensureLabels',
            'issues.create',
            'project.addIssue',
            'project.setStatus:Todo',
        ])
    })

    it('updates stale generated content and managed labels while preserving unmanaged labels', async (): Promise<void> => {
        const plan = buildPlan('.agents/plans/payments/01-a.md', {
            readiness: 'Blocked by missing provider evidence.',
        })
        const existing = existingIssue(plan, {
            title: 'Old title',
            body: `${execPlanMarker(plan.key)}\nOld generated body.`,
            labels: ['execplan', 'triage'],
        })
        const issues = new FakeIssueRepository([existing])
        const project = new FakeProjectBoard([{ id: 'item-9', contentUrl: existing.url, status: 'Todo' }])

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([plan])

        expect(issues.updated).toEqual([
            {
                issueNumber: 42,
                update: {
                    title: plan.title,
                    body: renderedBody(plan),
                    labelsToAdd: ['blocked'],
                    labelsToRemove: [],
                },
            },
        ])
        expect(project.addedIssueNumbers).toHaveLength(0)
        expect(project.statusWrites).toEqual([{ itemId: 'item-9', status: 'Backlog' }])
        expect(report.outcomes[0]).toMatchObject({
            issueAction: 'updated',
            status: 'Backlog',
            statusApplied: true,
            statusWouldChange: true,
            addedToProject: false,
        })
    })

    it('reports an exact issue and project item as unchanged without issue or project writes', async (): Promise<void> => {
        const plan = buildPlan()
        const existing = existingIssue(plan, { labels: ['execplan', 'triage'] })
        const issues = new FakeIssueRepository([existing])
        const project = new FakeProjectBoard([{ id: 'item-9', contentUrl: existing.url, status: 'Todo' }])

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([plan])

        expect(issues.created).toHaveLength(0)
        expect(issues.updated).toHaveLength(0)
        expect(project.addedIssueNumbers).toHaveLength(0)
        expect(project.statusWrites).toHaveLength(0)
        expect(report.outcomes[0]).toMatchObject({
            issueAction: 'unchanged',
            statusApplied: false,
            statusWouldChange: false,
            addedToProject: false,
        })
    })

    it('adds an existing issue missing from the project and applies its status', async (): Promise<void> => {
        const plan = buildPlan()
        const existing = existingIssue(plan)
        const issues = new FakeIssueRepository([existing])
        const project = new FakeProjectBoard()

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([plan])

        expect(project.addedIssueNumbers).toEqual([existing.number])
        expect(project.statusWrites).toEqual([{ itemId: 'item-1', status: 'Todo' }])
        expect(report.outcomes[0]).toMatchObject({
            addedToProject: true,
            statusApplied: true,
            statusWouldChange: true,
        })
    })

    it('reconciles a mismatched project status without adding the issue again', async (): Promise<void> => {
        const plan = buildPlan('.agents/plans/payments/01-a.md', { progress: '- [x] Started.\n- [ ] Finish.' })
        const existing = existingIssue(plan)
        const issues = new FakeIssueRepository([existing])
        const project = new FakeProjectBoard([{ id: 'item-9', contentUrl: existing.url, status: 'Todo' }])

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([plan])

        expect(project.addedIssueNumbers).toHaveLength(0)
        expect(project.statusWrites).toEqual([{ itemId: 'item-9', status: 'In Progress' }])
        expect(report.outcomes[0]).toMatchObject({
            status: 'In Progress',
            statusApplied: true,
            statusWouldChange: true,
        })
    })

    it.each([
        ['Todo', 'Ready to implement.'],
        ['Backlog', 'Blocked by missing evidence.'],
    ])(
        'preserves assigned In Progress work when repository state resolves to %s',
        async (_expectedStatus, readiness): Promise<void> => {
            const plan = buildPlan('.agents/plans/payments/01-a.md', { readiness })
            const existing = existingIssue(plan, { assignees: ['developer'] })
            const issues = new FakeIssueRepository([existing])
            const project = new FakeProjectBoard([{ id: 'item-9', contentUrl: existing.url, status: 'In Progress' }])

            const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([plan])

            expect(project.statusWrites).toHaveLength(0)
            expect(report.outcomes[0]).toMatchObject({
                status: _expectedStatus,
                statusApplied: false,
                statusWouldChange: false,
            })
        },
    )

    it('does not move an existing Done item backward', async (): Promise<void> => {
        const plan = buildPlan()
        const existing = existingIssue(plan)
        const issues = new FakeIssueRepository([existing])
        const project = new FakeProjectBoard([{ id: 'item-9', contentUrl: existing.url, status: 'Done' }])

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([plan])

        expect(project.statusWrites).toHaveLength(0)
        expect(report.outcomes[0]).toMatchObject({
            status: 'Todo',
            statusApplied: false,
            statusWouldChange: false,
        })
    })

    it('allows assigned In Progress work to advance to Done', async (): Promise<void> => {
        const plan = buildPlan('.agents/plans/payments/01-a.md', { progress: '- [x] Complete.' })
        const existing = existingIssue(plan, { assignees: ['developer'] })
        const issues = new FakeIssueRepository([existing])
        const project = new FakeProjectBoard([{ id: 'item-9', contentUrl: existing.url, status: 'In Progress' }])

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([plan])

        expect(project.statusWrites).toEqual([{ itemId: 'item-9', status: 'Done' }])
        expect(report.outcomes[0]).toMatchObject({ status: 'Done', statusApplied: true, statusWouldChange: true })
    })

    it('reports every dry-run change while performing zero mutations', async (): Promise<void> => {
        const existingPlan = buildPlan('.agents/plans/payments/01-a.md')
        const missingPlan = buildPlan('.agents/plans/payments/02-b.md')
        const existing = existingIssue(existingPlan, {
            title: 'Stale title',
            body: `${execPlanMarker(existingPlan.key)}\nStale body.`,
        })
        const issues = new FakeIssueRepository([existing])
        const project = new FakeProjectBoard()

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions(true)).sync([
            existingPlan,
            missingPlan,
        ])

        expectNoMutations(issues, project)
        expect(project.validatedStatuses).toHaveLength(1)
        expect(issues.listCalls).toBe(1)
        expect(project.listCalls).toBe(1)
        expect(report.outcomes).toEqual([
            expect.objectContaining({
                key: 'payments/01',
                issueAction: 'updated',
                statusApplied: false,
                statusWouldChange: true,
                addedToProject: true,
            }),
            expect.objectContaining({
                key: 'payments/02',
                issueAction: 'created',
                statusApplied: false,
                statusWouldChange: true,
                addedToProject: false,
            }),
        ])
        expect(existing).toMatchObject({
            title: 'Stale title',
            body: `${execPlanMarker(existingPlan.key)}\nStale body.`,
        })
    })

    it.each([
        [
            'an invalid marker-like comment',
            (): IssueSummary[] => [
                existingIssue(buildPlan(), {
                    body: '<!-- execplan: Payments/01 -->',
                }),
            ],
            'Issue #42 contains an invalid ExecPlan marker',
        ],
        [
            'a valid marker mixed with an invalid marker-like comment',
            (): IssueSummary[] => [
                existingIssue(buildPlan(), {
                    body: `${execPlanMarker('payments/01')}\n<!-- ExecPlan : Payments/02 -->`,
                }),
            ],
            'Issue #42 contains an invalid ExecPlan marker',
        ],
        [
            'a managed issue whose marker was removed',
            (): IssueSummary[] => [
                existingIssue(buildPlan(), {
                    body: 'Generated body without its marker',
                    labels: ['execplan'],
                }),
            ],
            'Issue #42 contains an invalid ExecPlan marker',
        ],
        [
            'an issue with multiple markers',
            (): IssueSummary[] => [
                existingIssue(buildPlan(), {
                    body: `${execPlanMarker('payments/01')}\n${execPlanMarker('payments/02')}`,
                }),
            ],
            'Issue #42 contains multiple ExecPlan markers: payments/01, payments/02',
        ],
        [
            'the same marker on multiple issues',
            (): IssueSummary[] => {
                const plan = buildPlan()
                return [existingIssue(plan), existingIssue(plan, { number: 43, url: 'https://example.test/issues/43' })]
            },
            'Duplicate ExecPlan marker <!-- execplan: payments/01 --> on issues #42 and #43',
        ],
    ])('rejects %s before any mutation', async (_name, buildIssues, expectedError): Promise<void> => {
        const events: string[] = []
        const issues = new FakeIssueRepository(buildIssues(), events)
        const project = new FakeProjectBoard([], events)

        await expect(
            new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([buildPlan()]),
        ).rejects.toThrow(expectedError)

        expectNoMutations(issues, project)
        expect(events).toEqual(['project.validateStatusOptions', 'issues.list:execplan', 'project.listItems'])
    })

    it('reports orphaned generated issues without mutating them', async (): Promise<void> => {
        const plan = buildPlan()
        const current = existingIssue(plan)
        const orphan: IssueSummary = {
            number: 99,
            url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/99',
            title: 'Removed plan',
            body: `${execPlanMarker('legacy/09')}\nGenerated body.`,
            assignees: [],
            labels: ['execplan'],
        }
        const issues = new FakeIssueRepository([current, orphan])
        const project = new FakeProjectBoard([{ id: 'item-9', contentUrl: current.url, status: 'Todo' }])

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions(true)).sync([plan])

        expectNoMutations(issues, project)
        expect(report.orphanedIssues).toEqual([{ key: 'legacy/09', issueNumber: 99, url: orphan.url }])
        expect(report.outcomes[0]).toMatchObject({ issueAction: 'unchanged', statusWouldChange: false })
    })

    it('ignores an unlabelled issue whose user-controlled body contains an exact marker', async (): Promise<void> => {
        const plan = buildPlan()
        const lookalike = existingIssue(plan, { labels: [] })
        const issues = new FakeIssueRepository([lookalike])
        const project = new FakeProjectBoard()

        const report = await new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([plan])

        expect(issues.updated).toHaveLength(0)
        expect(issues.created).toHaveLength(1)
        expect(issues.created[0]?.labels).toEqual(['execplan'])
        expect(project.addedIssueNumbers).toEqual([101])
        expect(report.outcomes[0]).toMatchObject({ issueNumber: 101, issueAction: 'created' })
    })

    it('aborts on project-schema preflight before listing or mutating issues and items', async (): Promise<void> => {
        const events: string[] = []
        const issues = new FakeIssueRepository([], events)
        const project = new FakeProjectBoard([], events, new Error('Status is missing: Done'))

        await expect(
            new ExecPlanSynchronizer(issues, project, synchronizerOptions()).sync([buildPlan()]),
        ).rejects.toThrow('Status is missing: Done')

        expectNoMutations(issues, project)
        expect(issues.listCalls).toBe(0)
        expect(project.listCalls).toBe(0)
        expect(events).toEqual(['project.validateStatusOptions'])
    })
})
