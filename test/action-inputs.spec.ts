import { readFile } from 'node:fs/promises'
import { readActionInputs } from '../src/action-inputs.js'
import { resolveConfig } from '../src/config.js'

function reader(inputs: Record<string, string>): (name: string) => string {
    return (name): string => inputs[name] ?? ''
}

describe('Action input resolution', (): void => {
    it('keeps migration-sensitive defaults out of Action metadata', async (): Promise<void> => {
        const metadata = await readFile(new URL('../action.yml', import.meta.url), 'utf8')
        const lines = metadata.split('\n')
        const inputBlock = (name: string): string[] => {
            const start = lines.indexOf(`    ${name}:`)
            const rest = lines.slice(start + 1)
            const end = rest.findIndex((line) => /^ {4}[a-z][a-z-]*:$/.test(line))
            return end === -1 ? rest : rest.slice(0, end)
        }

        expect(inputBlock('plans-directory')).not.toContainEqual(expect.stringContaining('default:'))
        expect(inputBlock('dry-run')).not.toContainEqual(expect.stringContaining('default:'))
    })

    it('leaves omitted plans-directory and dry-run inputs available for legacy environment fallbacks', (): void => {
        const raw = readActionInputs(reader({ mode: 'sync' }))
        const config = resolveConfig(
            raw,
            {
                PLANS_DIR: 'legacy/plans',
                PLANS_DRY_RUN: 'true',
                GITHUB_REPOSITORY: 'ExampleOrg/example-repository',
                PLANS_BRANCH: 'master',
                PLANS_PROJECT_OWNER: 'ExampleOrg',
                PLANS_PROJECT_NUMBER: '7',
            },
            '/workspace',
        )

        expect(raw.plansDirectory).toBeUndefined()
        expect(raw.dryRun).toBeUndefined()
        expect(config).toMatchObject({ plansDirectory: 'legacy/plans', dryRun: true })
    })

    it('preserves explicit input precedence and trims values', (): void => {
        const raw = readActionInputs(
            reader({
                mode: ' sync ',
                'plans-directory': ' input/plans ',
                'dry-run': ' false ',
                repository: ' ExampleOrg/example-repository ',
                'source-ref': ' main ',
                'project-owner': ' ExampleOrg ',
                'project-number': ' 8 ',
            }),
        )
        const config = resolveConfig(raw, { PLANS_DIR: 'legacy/plans', PLANS_DRY_RUN: 'true' }, '/workspace')

        expect(config).toMatchObject({
            plansDirectory: 'input/plans',
            dryRun: false,
            repository: 'ExampleOrg/example-repository',
            sourceRef: 'main',
            project: { owner: 'ExampleOrg', number: 8 },
        })
    })
})
