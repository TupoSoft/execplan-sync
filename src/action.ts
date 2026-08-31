import * as core from '@actions/core'
import { readActionInputs } from './action-inputs.js'
import { GitHubApi, createGitHubClient, projectApiVersion } from './adapters/github-api.js'
import { resolveConfig } from './config.js'
import { loadAndValidatePlans, synchronizePlans } from './run.js'

function input(name: string): string | undefined {
    return core.getInput(name).trim() || undefined
}

function setCountOutputs(counts: {
    plans: number
    created: number
    updated: number
    unchanged: number
    orphaned: number
}): void {
    for (const [name, value] of Object.entries(counts)) {
        core.setOutput(name, String(value))
    }
}

async function run(): Promise<void> {
    const config = resolveConfig(readActionInputs(core.getInput))

    if (config.mode === 'validate') {
        const plans = await loadAndValidatePlans(config)
        setCountOutputs({ plans: plans.length, created: 0, updated: 0, unchanged: 0, orphaned: 0 })
        core.info(`${plans.length} ExecPlans validated.`)
        await core.summary.addHeading('ExecPlan validation').addRaw(`${plans.length} ExecPlans are valid.`).write()
        return
    }

    if (!config.repository || !config.project) {
        throw new Error('repository and project configuration are required in sync mode')
    }

    const token = input('github-token') ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN

    if (!token) {
        throw new Error('github-token is required in sync mode; pass a short-lived GitHub App installation token')
    }

    core.setSecret(token)
    const apiVersion = projectApiVersion(config.serverUrl)
    const api = new GitHubApi(createGitHubClient(token, apiVersion), {
        repository: config.repository,
        projectOwner: config.project.owner,
        projectNumber: config.project.number,
        statusField: config.project.statusField,
        apiVersion,
    })
    const report = await synchronizePlans(config, api, api)
    const counts = {
        plans: report.outcomes.length,
        created: report.outcomes.filter((outcome) => outcome.issueAction === 'created').length,
        updated: report.outcomes.filter((outcome) => outcome.issueAction === 'updated').length,
        unchanged: report.outcomes.filter((outcome) => outcome.issueAction === 'unchanged').length,
        orphaned: report.orphanedIssues.length,
    }

    for (const outcome of report.outcomes) {
        const issue = outcome.issueNumber ? `#${outcome.issueNumber}` : '(new)'
        const status = outcome.statusApplied
            ? `status -> ${outcome.status}`
            : outcome.statusWouldChange
              ? `status would change to ${outcome.status}`
              : `status ${outcome.status}`
        const project = outcome.addedToProject ? ', added to project' : ''
        core.info(
            `${config.dryRun ? '[dry-run] ' : ''}${outcome.key} ${issue}: ${outcome.issueAction}, ${status}${project}`,
        )
    }

    for (const orphan of report.orphanedIssues) {
        core.warning(`Orphaned ExecPlan issue ${orphan.key}: #${orphan.issueNumber} (${orphan.url})`)
    }

    setCountOutputs(counts)
    await core.summary
        .addHeading(config.dryRun ? 'ExecPlan sync dry run' : 'ExecPlan sync')
        .addTable([
            [
                { data: 'Plans', header: true },
                { data: 'Created', header: true },
                { data: 'Updated', header: true },
                { data: 'Unchanged', header: true },
                { data: 'Orphaned', header: true },
            ],
            [counts.plans, counts.created, counts.updated, counts.unchanged, counts.orphaned].map(String),
        ])
        .write()
}

void run().catch((error: unknown) => {
    core.setFailed(error instanceof Error ? error.message : String(error))
})
