import {
    analyzeExecPlanMarkers,
    execPlanMarker,
    extractExecPlanMarkers,
    isBlockedPlan,
    parseExecPlan,
    planKeyFromPath,
    renderIssueBody,
    resolvePlanStates,
} from '../src/domain/execplan.js'
import { buildPlanFile } from './fixtures.js'

describe('ExecPlan parsing', (): void => {
    it.each([
        ['.agents/plans/payments/01-idempotent-credit-grants.md', 'payments/01'],
        ['.agents\\plans\\proxy-fleet\\12-ansible.md', 'proxy-fleet/12'],
        ['.agents/plans/Payments/01-uppercase.md', undefined],
        ['.agents/plans/proxy_fleet/01-underscore.md', undefined],
        ['.agents/plans/payments/README.md', undefined],
        ['.agents/plans/payments/not-numbered.md', undefined],
    ])('derives the stable key from %s', (path, expected): void => {
        expect(planKeyFromPath(path)).toBe(expected)
    })

    it('extracts required metadata and progress', (): void => {
        const plan = parseExecPlan(
            '.agents/plans/payments/01-a.md',
            buildPlanFile({
                progress: '- [x] Started.\n- [ ] Finish.',
                dependencies: '- `auth/01`\n- `payments/00`',
            }),
        )

        expect(plan).toMatchObject({
            key: 'payments/01',
            title: 'Grant credits idempotently',
            dependencies: ['auth/01', 'payments/00'],
            progress: { completed: 1, total: 2 },
            readiness: { state: 'ready', text: 'Ready to implement.' },
        })
    })

    it.each(['## Plan Dependencies', '## PLAN DEPENDENCIES'])(
        'rejects malformed canonical heading %s',
        (heading): void => {
            const contents = buildPlanFile().replace('## Plan dependencies', heading)
            expect(() => parseExecPlan('.agents/plans/f/01-a.md', contents)).toThrow(
                'expected exactly "## Plan dependencies"',
            )
        },
    )

    it.each(['## Plan Readiness', '## PLAN READINESS'])('rejects malformed canonical heading %s', (heading): void => {
        const contents = buildPlanFile().replace('## Plan readiness', heading)
        expect(() => parseExecPlan('.agents/plans/f/01-a.md', contents)).toThrow('expected exactly "## Plan readiness"')
    })

    it('requires dependencies for incomplete plans but accepts completed legacy plans', (): void => {
        const incomplete = buildPlanFile().replace('## Plan dependencies\n\nNone.\n\n', '')
        const complete = buildPlanFile({ progress: '- [x] Done.' }).replace('## Plan dependencies\n\nNone.\n\n', '')

        expect(() => parseExecPlan('.agents/plans/f/01-a.md', incomplete)).toThrow('missing a "## Plan dependencies"')
        expect(parseExecPlan('.agents/plans/f/01-a.md', complete).dependencies).toEqual([])
    })

    it('requires a nonempty readiness section', (): void => {
        expect(() => parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ readiness: '' }))).toThrow(
            'missing a nonempty "## Plan readiness"',
        )
    })

    it.each([
        ['Ready to implement.', false],
        ['Ready after a decision.', true],
        ['Blocked by evidence.', true],
        ['Unexpected.', false],
    ])('classifies blocked labeling for %s', (readiness, expected): void => {
        const plan = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ readiness }))
        expect(isBlockedPlan(plan)).toBe(expected)
    })
})

describe('ExecPlan state resolution', (): void => {
    function status(progress: string, readiness = 'Ready to implement.'): string | undefined {
        const plan = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ progress, readiness }))
        return resolvePlanStates([plan]).get(plan.key)?.status
    }

    it.each([
        ['- [ ] One.\n- [ ] Two.', 'todo'],
        ['- [x] One.\n- [ ] Two.', 'inProgress'],
        ['- [x] One.\n- [x] Two.', 'done'],
        ['None yet.', 'todo'],
    ])('maps progress to %s', (progress, expected): void => {
        expect(status(progress)).toBe(expected)
    })

    it.each(['Ready after a decision.', 'Blocked by evidence.', 'Unexpected wording.'])(
        'keeps unready plans in backlog: %s',
        (readiness): void => {
            expect(status('- [ ] Work.', readiness)).toBe('backlog')
        },
    )

    it('promotes a dependent plan only after every dependency is complete', (): void => {
        const first = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ progress: '- [x] Complete.' }))
        const second = parseExecPlan(
            '.agents/plans/f/02-b.md',
            buildPlanFile({ dependencies: '- `f/01`', progress: '- [ ] Work.' }),
        )

        expect(resolvePlanStates([first, second]).get('f/02')).toEqual({ status: 'todo' })
        first.progress.completed = 0
        expect(resolvePlanStates([first, second]).get('f/02')).toEqual({
            status: 'backlog',
            detail: 'Waiting for `f/01`.',
        })
    })

    it.each([
        ['missing dependency', '- `f/99`', 'depends on missing ExecPlan f/99'],
        ['self dependency', '- `f/01`', 'cannot depend on itself'],
    ])('rejects a %s', (_name, dependencies, message): void => {
        const plan = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ dependencies }))
        expect(() => resolvePlanStates([plan])).toThrow(message)
    })

    it('rejects dependency cycles and duplicate keys', (): void => {
        const first = parseExecPlan('.agents/plans/f/01-a.md', buildPlanFile({ dependencies: '- `f/02`' }))
        const second = parseExecPlan('.agents/plans/f/02-b.md', buildPlanFile({ dependencies: '- `f/01`' }))
        expect(() => resolvePlanStates([first, second])).toThrow('ExecPlan dependency cycle: f/01 -> f/02 -> f/01')

        const duplicate = parseExecPlan('.agents/plans/f/01-renamed.md', buildPlanFile())
        expect(() => resolvePlanStates([first, duplicate])).toThrow('Duplicate ExecPlan key f/01')
    })
})

describe('issue rendering compatibility', (): void => {
    it('preserves markers and discovers them exactly', (): void => {
        expect(execPlanMarker('payments/01')).toBe('<!-- execplan: payments/01 -->')
        expect(extractExecPlanMarkers('x <!-- execplan: payments/01 --> y')).toEqual(['payments/01'])
    })

    it('reports malformed candidates even when a valid marker is also present', (): void => {
        const body = '<!-- execplan: payments/01 -->\n<!-- ExecPlan : Payments/02 -->'

        expect(analyzeExecPlanMarkers(body)).toEqual({
            markers: ['payments/01'],
            malformedCandidates: ['<!-- ExecPlan : Payments/02 -->'],
        })
    })

    it('treats an unclosed marker-like comment as malformed', (): void => {
        expect(analyzeExecPlanMarkers('<!-- execplan: payments/01')).toEqual({
            markers: [],
            malformedCandidates: ['<!-- execplan: payments/01'],
        })
    })

    it('treats a suffix on the marker prefix as malformed', (): void => {
        const body = '<!-- execplan_: payments/01 -->'

        expect(analyzeExecPlanMarkers(body)).toEqual({
            markers: [],
            malformedCandidates: [body],
        })
    })

    it('renders the legacy LeadEmailFinder body byte-for-byte when configured with the legacy generator', (): void => {
        const plan = parseExecPlan('.agents/plans/payments/01-a.md', buildPlanFile())
        const state = resolvePlanStates([plan]).get(plan.key)!

        expect(
            renderIssueBody(plan, state, {
                blobBaseUrl: 'https://github.com/TupoSoft/LeadEmailFinder/blob/master',
                generator: 'pnpm plans:sync',
                statusName: 'Todo',
            }),
        ).toBe(
            '<!-- execplan: payments/01 -->\n' +
                'Generated from [`.agents/plans/payments/01-a.md`](https://github.com/TupoSoft/LeadEmailFinder/blob/master/.agents/plans/payments/01-a.md) by `pnpm plans:sync`. Edits to this description are\n' +
                'overwritten on the next sync; use comments for discussion.\n\n' +
                '## Purpose\n\n' +
                'Make adding credits as safe as spending them.\n\n' +
                '## Plan state\n\n' +
                '- Readiness: Ready to implement.\n' +
                '- Dependencies: None.\n' +
                '- Progress: 0 of 2 tasks complete.\n' +
                '- Effective status: Todo\n',
        )
    })
})
