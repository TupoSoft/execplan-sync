import {
    GitHubApi,
    projectApiVersion,
    type GitHubApiOptions,
    type GitHubApiRuntime,
    type GitHubClient,
} from '../src/adapters/github-api.js'

interface Page {
    data: unknown[]
}

interface Harness {
    api: GitHubApi
    endpoints: {
        listLabelsForRepo: ReturnType<typeof vi.fn>
        listForRepo: ReturnType<typeof vi.fn>
    }
    iterator: ReturnType<typeof vi.fn<(route: unknown, parameters: unknown) => AsyncIterable<Page>>>
    createLabel: ReturnType<typeof vi.fn<(parameters: unknown) => Promise<unknown>>>
    updateLabel: ReturnType<typeof vi.fn<(parameters: unknown) => Promise<unknown>>>
    createIssue: ReturnType<typeof vi.fn<(parameters: unknown) => Promise<{ data: Record<string, unknown> }>>>
    updateIssue: ReturnType<typeof vi.fn<(parameters: unknown) => Promise<unknown>>>
    addLabels: ReturnType<typeof vi.fn<(parameters: unknown) => Promise<unknown>>>
    removeLabel: ReturnType<typeof vi.fn<(parameters: unknown) => Promise<unknown>>>
    request: ReturnType<
        typeof vi.fn<(route: string, parameters: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>>
    >
}

const OPTIONS: GitHubApiOptions = {
    repository: 'TupoSoft/LeadEmailFinder',
    projectOwner: 'TupoSoft',
    projectNumber: 9,
    statusField: 'Status',
}

function paginated(...pages: unknown[][]): AsyncIterable<Page> {
    return {
        [Symbol.asyncIterator](): AsyncIterator<Page> {
            let index = 0

            return {
                next(): Promise<IteratorResult<Page>> {
                    const data = pages[index]
                    index += 1

                    return data
                        ? Promise.resolve({ done: false, value: { data } })
                        : Promise.resolve({ done: true, value: undefined })
                },
            }
        },
    }
}

function createHarness(
    implementation: (route: unknown, parameters: unknown) => AsyncIterable<Page> = (): AsyncIterable<Page> =>
        paginated(),
    options: GitHubApiOptions = OPTIONS,
    runtime: GitHubApiRuntime = { mutationIntervalMs: 0 },
): Harness {
    const endpoints = {
        listLabelsForRepo: vi.fn(),
        listForRepo: vi.fn(),
    }
    const iterator = vi.fn<(route: unknown, parameters: unknown) => AsyncIterable<Page>>(implementation)
    const createLabel = vi.fn<(parameters: unknown) => Promise<unknown>>((): Promise<unknown> => Promise.resolve({}))
    const updateLabel = vi.fn<(parameters: unknown) => Promise<unknown>>((): Promise<unknown> => Promise.resolve({}))
    const createIssue = vi.fn<(parameters: unknown) => Promise<{ data: Record<string, unknown> }>>()
    const updateIssue = vi.fn<(parameters: unknown) => Promise<unknown>>((): Promise<unknown> => Promise.resolve({}))
    const addLabels = vi.fn<(parameters: unknown) => Promise<unknown>>((): Promise<unknown> => Promise.resolve({}))
    const removeLabel = vi.fn<(parameters: unknown) => Promise<unknown>>((): Promise<unknown> => Promise.resolve({}))
    const request = vi.fn<
        (route: string, parameters: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>
    >((): Promise<{ data: Record<string, unknown> }> => Promise.resolve({ data: {} }))
    const client = {
        paginate: { iterator },
        rest: {
            issues: {
                ...endpoints,
                createLabel,
                updateLabel,
                create: createIssue,
                update: updateIssue,
                addLabels,
                removeLabel,
            },
        },
        request,
    } as unknown as GitHubClient

    return {
        api: new GitHubApi(client, options, runtime),
        endpoints,
        iterator,
        createLabel,
        updateLabel,
        createIssue,
        updateIssue,
        addLabels,
        removeLabel,
        request,
    }
}

function statusField(
    overrides: Partial<{
        id: number
        name: string
        data_type: string
        options: Array<{ id: string; name: { raw: string } }>
    }> = {},
): Record<string, unknown> {
    return {
        id: 153767334,
        name: 'Status',
        data_type: 'single_select',
        options: [
            { id: 'todo-option', name: { raw: 'Todo' } },
            { id: 'done-option', name: { raw: 'Done' } },
        ],
        ...overrides,
    }
}

describe('GitHub API version selection', (): void => {
    it('uses the current dotcom version and the GHES-compatible version elsewhere', (): void => {
        expect(projectApiVersion('https://github.com')).toBe('2026-03-10')
        expect(projectApiVersion('https://github.example.test')).toBe('2022-11-28')
    })
})

describe('GitHub issue adapter', (): void => {
    it('paginates labels and creates or updates only divergent definitions', async (): Promise<void> => {
        const harness = createHarness((): AsyncIterable<Page> => {
            return paginated(
                [{ name: 'execplan', color: 'ffffff', description: 'old' }],
                [{ name: 'blocked', color: 'B60205', description: 'Blocked' }],
            )
        })

        await harness.api.ensureLabels([
            { name: 'execplan', color: '0E8A16', description: 'Generated' },
            { name: 'blocked', color: 'B60205', description: 'Blocked' },
            { name: 'ready', color: '1D76DB', description: 'Ready' },
        ])

        expect(harness.iterator).toHaveBeenCalledWith(harness.endpoints.listLabelsForRepo, {
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            per_page: 100,
        })
        expect(harness.updateLabel).toHaveBeenCalledOnce()
        expect(harness.updateLabel).toHaveBeenCalledWith({
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            name: 'execplan',
            new_name: 'execplan',
            color: '0E8A16',
            description: 'Generated',
        })
        expect(harness.createLabel).toHaveBeenCalledOnce()
        expect(harness.createLabel).toHaveBeenCalledWith({
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            name: 'ready',
            color: '1D76DB',
            description: 'Ready',
        })
    })

    it('treats equivalent label-color casing as unchanged', async (): Promise<void> => {
        const harness = createHarness((): AsyncIterable<Page> =>
            paginated([{ name: 'execplan', color: '0e8a16', description: 'Generated' }]),
        )

        await harness.api.ensureLabels([{ name: 'execplan', color: '0E8A16', description: 'Generated' }])

        expect(harness.createLabel).not.toHaveBeenCalled()
        expect(harness.updateLabel).not.toHaveBeenCalled()
    })

    it('scans every issue page while returning only managed-labelled non-pull-request issues', async (): Promise<void> => {
        const harness = createHarness((): AsyncIterable<Page> => {
            return paginated(
                [
                    {
                        number: 1,
                        html_url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/1',
                        title: 'Plan one',
                        body: '<!-- execplan: alpha/01 -->',
                        assignees: [{ login: 'octocat' }],
                        labels: ['execplan', { name: 'blocked' }, { name: null }],
                    },
                    {
                        number: 2,
                        html_url: 'https://github.com/TupoSoft/LeadEmailFinder/pull/2',
                        title: 'Pull request',
                        body: '<!-- execplan: alpha/02 -->',
                        pull_request: { url: 'pull' },
                        labels: [],
                    },
                ],
                [
                    {
                        number: 3,
                        html_url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/3',
                        title: 'Unrelated',
                        body: 'No generated marker',
                        labels: [],
                    },
                    {
                        number: 4,
                        html_url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/4',
                        title: 'Plan four',
                        body: 'prefix <!-- execplan: beta/04 --> suffix',
                        assignees: [],
                        labels: [{ name: 'execplan' }],
                    },
                    {
                        number: 5,
                        html_url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/5',
                        title: 'Malformed marker',
                        body: '<!-- ExecPlan : Beta/05 -->',
                        assignees: [],
                        labels: [{ name: 'execplan' }],
                    },
                    {
                        number: 6,
                        html_url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/6',
                        title: 'Missing marker',
                        body: 'Generated body without its marker',
                        assignees: [],
                        labels: [{ name: 'ExecPlan' }],
                    },
                    {
                        number: 7,
                        html_url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/7',
                        title: 'Untrusted marker',
                        body: '<!-- execplan: beta/07 -->',
                        assignees: [],
                        labels: [],
                    },
                ],
            )
        })

        await expect(harness.api.listExecPlanIssues('execplan')).resolves.toEqual([
            {
                number: 1,
                url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/1',
                title: 'Plan one',
                body: '<!-- execplan: alpha/01 -->',
                assignees: ['octocat'],
                labels: ['execplan', 'blocked'],
            },
            {
                number: 4,
                url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/4',
                title: 'Plan four',
                body: 'prefix <!-- execplan: beta/04 --> suffix',
                assignees: [],
                labels: ['execplan'],
            },
            {
                number: 5,
                url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/5',
                title: 'Malformed marker',
                body: '<!-- ExecPlan : Beta/05 -->',
                assignees: [],
                labels: ['execplan'],
            },
            {
                number: 6,
                url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/6',
                title: 'Missing marker',
                body: 'Generated body without its marker',
                assignees: [],
                labels: ['ExecPlan'],
            },
        ])
        expect(harness.iterator).toHaveBeenCalledWith(harness.endpoints.listForRepo, {
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            state: 'all',
            per_page: 100,
        })
    })

    it('creates and updates issues with the configured repository coordinates', async (): Promise<void> => {
        const harness = createHarness()
        harness.createIssue.mockResolvedValue({
            data: {
                number: 51,
                html_url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/51',
                title: 'Generated plan',
                body: 'Generated body',
                assignees: [{ login: 'maintainer' }],
                labels: [{ name: 'execplan' }],
            },
        })

        await expect(
            harness.api.createIssue({ title: 'Generated plan', body: 'Generated body', labels: ['execplan'] }),
        ).resolves.toEqual({
            number: 51,
            url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/51',
            title: 'Generated plan',
            body: 'Generated body',
            assignees: ['maintainer'],
            labels: ['execplan'],
        })
        expect(harness.createIssue).toHaveBeenCalledWith({
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            title: 'Generated plan',
            body: 'Generated body',
            labels: ['execplan'],
        })

        await harness.api.updateIssue(51, {
            title: 'Updated plan',
            body: 'Updated body',
            labelsToAdd: ['blocked'],
            labelsToRemove: ['execplan'],
        })
        expect(harness.updateIssue).toHaveBeenCalledWith({
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            issue_number: 51,
            title: 'Updated plan',
            body: 'Updated body',
        })
        expect(harness.addLabels).toHaveBeenCalledWith({
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            issue_number: 51,
            labels: ['blocked'],
        })
        expect(harness.removeLabel).toHaveBeenCalledWith({
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            issue_number: 51,
            name: 'execplan',
        })
    })

    it('does not replace unmanaged labels and tolerates a concurrently removed managed label', async (): Promise<void> => {
        const harness = createHarness()
        harness.removeLabel.mockRejectedValue({ status: 404 })

        await expect(
            harness.api.updateIssue(51, {
                title: 'Updated plan',
                body: 'Updated body',
                labelsToAdd: [],
                labelsToRemove: ['blocked'],
            }),
        ).resolves.toBeUndefined()

        expect(harness.updateIssue).toHaveBeenCalledWith({
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            issue_number: 51,
            title: 'Updated plan',
            body: 'Updated body',
        })
    })

    it('paces consecutive mutations', async (): Promise<void> => {
        let now = 10_000
        const sleep = vi.fn<(milliseconds: number) => Promise<void>>((milliseconds): Promise<void> => {
            now += milliseconds
            return Promise.resolve()
        })
        const harness = createHarness(undefined, OPTIONS, {
            now: (): number => now,
            sleep,
            mutationIntervalMs: 1_000,
        })
        const update = { title: 'Plan', body: 'Body', labelsToAdd: [], labelsToRemove: [] }

        await harness.api.updateIssue(1, update)
        await harness.api.updateIssue(2, update)

        expect(sleep).toHaveBeenCalledOnce()
        expect(sleep).toHaveBeenCalledWith(1_000)
    })

    it('honors Retry-After for an explicitly rejected rate-limited mutation', async (): Promise<void> => {
        let now = 10_000
        const sleep = vi.fn<(milliseconds: number) => Promise<void>>((milliseconds): Promise<void> => {
            now += milliseconds
            return Promise.resolve()
        })
        const harness = createHarness(undefined, OPTIONS, {
            now: (): number => now,
            sleep,
            mutationIntervalMs: 0,
            maxRateLimitRetries: 1,
        })
        harness.updateIssue
            .mockRejectedValueOnce({ status: 429, response: { headers: { 'retry-after': '2' } } })
            .mockResolvedValueOnce({})

        await expect(
            harness.api.updateIssue(1, { title: 'Plan', body: 'Body', labelsToAdd: [], labelsToRemove: [] }),
        ).resolves.toBeUndefined()

        expect(harness.updateIssue).toHaveBeenCalledTimes(2)
        expect(sleep).toHaveBeenCalledWith(2_000)
    })

    it('uses a one-minute fallback for a rate-limited response without headers', async (): Promise<void> => {
        let now = 10_000
        const sleep = vi.fn<(milliseconds: number) => Promise<void>>((milliseconds): Promise<void> => {
            now += milliseconds
            return Promise.resolve()
        })
        const harness = createHarness(undefined, OPTIONS, {
            now: (): number => now,
            sleep,
            mutationIntervalMs: 0,
            maxRateLimitRetries: 1,
        })
        harness.updateIssue.mockRejectedValueOnce({ status: 429, response: { headers: {} } }).mockResolvedValueOnce({})

        await harness.api.updateIssue(1, { title: 'Plan', body: 'Body', labelsToAdd: [], labelsToRemove: [] })

        expect(harness.updateIssue).toHaveBeenCalledTimes(2)
        expect(sleep).toHaveBeenCalledWith(60_000)
    })

    it('honors the primary rate-limit reset epoch when remaining is zero', async (): Promise<void> => {
        let now = 10_000
        const sleep = vi.fn<(milliseconds: number) => Promise<void>>((milliseconds): Promise<void> => {
            now += milliseconds
            return Promise.resolve()
        })
        const harness = createHarness(undefined, OPTIONS, {
            now: (): number => now,
            sleep,
            mutationIntervalMs: 0,
            maxRateLimitRetries: 1,
        })
        harness.updateIssue
            .mockRejectedValueOnce({
                status: 403,
                response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '12' } },
            })
            .mockResolvedValueOnce({})

        await harness.api.updateIssue(1, { title: 'Plan', body: 'Body', labelsToAdd: [], labelsToRemove: [] })

        expect(harness.updateIssue).toHaveBeenCalledTimes(2)
        expect(sleep).toHaveBeenCalledWith(2_000)
    })

    it('does not retry an ambiguous non-HTTP mutation failure', async (): Promise<void> => {
        const sleep = vi.fn<(milliseconds: number) => Promise<void>>((): Promise<void> => Promise.resolve())
        const harness = createHarness(undefined, OPTIONS, {
            sleep,
            mutationIntervalMs: 0,
            maxRateLimitRetries: 2,
        })
        const error = new Error('Connection closed after the request may have completed')
        harness.updateIssue.mockRejectedValue(error)

        await expect(
            harness.api.updateIssue(1, { title: 'Plan', body: 'Body', labelsToAdd: [], labelsToRemove: [] }),
        ).rejects.toBe(error)

        expect(harness.updateIssue).toHaveBeenCalledOnce()
        expect(sleep).not.toHaveBeenCalled()
    })

    it('does not shorten a Retry-After value beyond the automatic-wait ceiling', async (): Promise<void> => {
        const sleep = vi.fn<(milliseconds: number) => Promise<void>>((): Promise<void> => Promise.resolve())
        const harness = createHarness(undefined, OPTIONS, {
            now: (): number => 10_000,
            sleep,
            mutationIntervalMs: 0,
            maxRateLimitRetries: 1,
        })
        const error = { status: 429, response: { headers: { 'retry-after': '600' } } }
        harness.updateIssue.mockRejectedValue(error)

        await expect(
            harness.api.updateIssue(1, { title: 'Plan', body: 'Body', labelsToAdd: [], labelsToRemove: [] }),
        ).rejects.toBe(error)

        expect(harness.updateIssue).toHaveBeenCalledOnce()
        expect(sleep).not.toHaveBeenCalled()
    })
})

describe('GitHub Projects v2 adapter', (): void => {
    it('paginates fields and items while retaining the numeric status field ID', async (): Promise<void> => {
        const harness = createHarness((route): AsyncIterable<Page> => {
            if (route === 'GET /orgs/{org}/projectsV2/{project_number}/fields') {
                return paginated([{ id: 1, name: 'Title', data_type: 'title' }], [statusField({ id: 153767334 })])
            }

            if (route === 'GET /orgs/{org}/projectsV2/{project_number}/items') {
                return paginated(
                    [
                        {
                            id: 236813232,
                            content: { html_url: 'https://github.com/TupoSoft/LeadEmailFinder/issues/1' },
                            fields: [
                                {
                                    id: 153767334,
                                    name: 'Status',
                                    value: { id: 'todo-option', name: { raw: 'Todo' } },
                                },
                            ],
                        },
                    ],
                    [{ id: 236813233, content: {}, fields: [] }],
                )
            }

            throw new Error(`Unexpected paginated route: ${String(route)}`)
        })

        await expect(harness.api.validateStatusOptions(['Todo', 'Done'])).resolves.toBeUndefined()
        await expect(harness.api.listProjectItems()).resolves.toEqual([
            {
                id: '236813232',
                contentUrl: 'https://github.com/TupoSoft/LeadEmailFinder/issues/1',
                status: 'Todo',
            },
            { id: '236813233' },
        ])

        expect(harness.iterator).toHaveBeenCalledWith('GET /orgs/{org}/projectsV2/{project_number}/fields', {
            org: 'TupoSoft',
            project_number: 9,
            per_page: 100,
            headers: { 'x-github-api-version': '2026-03-10' },
        })
        expect(harness.iterator).toHaveBeenCalledWith('GET /orgs/{org}/projectsV2/{project_number}/items', {
            org: 'TupoSoft',
            project_number: 9,
            fields: '153767334',
            q: 'repo:TupoSoft/LeadEmailFinder',
            per_page: 100,
            headers: { 'x-github-api-version': '2026-03-10' },
        })
    })

    it.each([
        {
            name: 'missing field',
            fields: [{ id: 1, name: 'Priority', data_type: 'single_select', options: [] }],
            expected: 'has no Status field',
        },
        {
            name: 'non-select field',
            fields: [statusField({ data_type: 'text' })],
            expected: 'must be a single-select field',
        },
    ])('rejects a $name', async ({ fields, expected }): Promise<void> => {
        const harness = createHarness((): AsyncIterable<Page> => paginated(fields))
        await expect(harness.api.validateStatusOptions(['Todo'])).rejects.toThrow(expected)
    })

    it('reports every missing configured status option', async (): Promise<void> => {
        const harness = createHarness((): AsyncIterable<Page> => paginated([statusField()]))

        await expect(harness.api.validateStatusOptions(['Todo', 'In Progress', 'Blocked'])).rejects.toThrow(
            'Status is missing: In Progress, Blocked',
        )
    })

    it('adds an issue and writes a single-select status with numeric REST IDs', async (): Promise<void> => {
        const harness = createHarness((route): AsyncIterable<Page> => {
            if (route === 'GET /orgs/{org}/projectsV2/{project_number}/fields') {
                return paginated([statusField({ id: 153767334 })])
            }

            throw new Error(`Unexpected paginated route: ${String(route)}`)
        })
        harness.request.mockImplementation((route): Promise<{ data: Record<string, unknown> }> =>
            Promise.resolve(route.startsWith('POST ') ? { data: { id: 236813232 } } : { data: {} }),
        )

        await expect(harness.api.addIssueToProject(51)).resolves.toBe('236813232')
        expect(harness.request).toHaveBeenCalledWith('POST /orgs/{org}/projectsV2/{project_number}/items', {
            org: 'TupoSoft',
            project_number: 9,
            type: 'Issue',
            owner: 'TupoSoft',
            repo: 'LeadEmailFinder',
            number: 51,
            headers: { 'x-github-api-version': '2026-03-10' },
        })

        await harness.api.setItemStatus('236813232', 'Done')
        expect(harness.request).toHaveBeenCalledWith('PATCH /orgs/{org}/projectsV2/{project_number}/items/{item_id}', {
            org: 'TupoSoft',
            project_number: 9,
            item_id: 236813232,
            fields: [{ id: 153767334, value: 'done-option' }],
            headers: { 'x-github-api-version': '2026-03-10' },
        })
        expect(harness.iterator).toHaveBeenCalledTimes(1)
    })

    it('rejects unknown status writes before making a mutation', async (): Promise<void> => {
        const harness = createHarness((): AsyncIterable<Page> => paginated([statusField()]))

        await expect(harness.api.setItemStatus('236813232', 'Unknown')).rejects.toThrow(
            'Status option "Unknown" does not exist on the project',
        )
        expect(harness.request).not.toHaveBeenCalled()
    })
})
