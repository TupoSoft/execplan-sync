import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExecPlanSyncConfig } from '../src/config.js'
import { loadAndValidatePlans } from '../src/run.js'
import { buildPlanFile } from './fixtures.js'

const workspaces: string[] = []

async function workspace(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'execplan-sync-'))
    workspaces.push(path)
    return path
}

function validationConfig(root: string): ExecPlanSyncConfig {
    return {
        mode: 'validate',
        dryRun: false,
        workspace: root,
        plansDirectory: '.agents/plans',
        serverUrl: 'https://github.com',
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
        issueGenerator: 'execplan-sync',
    }
}

async function writePlan(root: string, feature: string, file: string, contents: string): Promise<void> {
    const directory = join(root, '.agents', 'plans', feature)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, file), contents)
}

afterEach(async (): Promise<void> => {
    await Promise.all(workspaces.splice(0).map((path) => rm(path, { force: true, recursive: true })))
})

describe('loadAndValidatePlans', (): void => {
    it('discovers plans from the caller workspace in stable key order', async (): Promise<void> => {
        const root = await workspace()
        await writePlan(root, 'zeta', '02-second.md', buildPlanFile())
        await writePlan(root, 'alpha', '01-first.md', buildPlanFile())

        const plans = await loadAndValidatePlans(validationConfig(root))

        expect(plans.map((plan) => plan.key)).toEqual(['alpha/01', 'zeta/02'])
        expect(plans.map((plan) => plan.path)).toEqual([
            '.agents/plans/alpha/01-first.md',
            '.agents/plans/zeta/02-second.md',
        ])
    })

    it('fails when the configured directory contains no plans', async (): Promise<void> => {
        const root = await workspace()
        await mkdir(join(root, '.agents', 'plans'), { recursive: true })

        await expect(loadAndValidatePlans(validationConfig(root))).rejects.toThrow('No ExecPlans found under')
    })

    it('validates the complete dependency graph before returning', async (): Promise<void> => {
        const root = await workspace()
        await writePlan(root, 'feature', '01-first.md', buildPlanFile({ dependencies: '- `feature/99`' }))

        await expect(loadAndValidatePlans(validationConfig(root))).rejects.toThrow(
            'feature/01 depends on missing ExecPlan feature/99',
        )
    })

    it.each(['Payments', 'proxy_fleet'])(
        'rejects marker-incompatible feature directory %s instead of silently skipping it',
        async (feature): Promise<void> => {
            const root = await workspace()
            await writePlan(root, feature, '01-first.md', buildPlanFile())

            await expect(loadAndValidatePlans(validationConfig(root))).rejects.toThrow(
                `uses invalid feature directory "${feature}"`,
            )
        },
    )

    it.skipIf(process.platform === 'win32')(
        'rejects a plans-directory symlink that leaves the caller workspace',
        async (): Promise<void> => {
            const root = await workspace()
            const outside = await workspace()
            await writePlan(outside, 'feature', '01-first.md', buildPlanFile())
            await mkdir(join(root, '.agents'), { recursive: true })
            await symlink(join(outside, '.agents', 'plans'), join(root, '.agents', 'plans'))

            await expect(loadAndValidatePlans(validationConfig(root))).rejects.toThrow(
                'plans-directory resolves outside the repository workspace',
            )
        },
    )
})
