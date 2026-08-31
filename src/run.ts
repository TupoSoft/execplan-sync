import { realpath } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { ExecPlanSynchronizer, type SyncReport } from './application/synchronizer.js'
import { blobBaseUrl, type ExecPlanSyncConfig } from './config.js'
import { discoverExecPlans, resolvePlanStates, type ExecPlan } from './domain/execplan.js'
import type { IssueRepositoryPort, ProjectBoardPort } from './ports/github.js'

function isInside(parent: string, child: string): boolean {
    const path = relative(parent, child)
    return path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith('/') && !path.startsWith('\\')
}

export async function loadAndValidatePlans(config: ExecPlanSyncConfig): Promise<ExecPlan[]> {
    const workspace = await realpath(config.workspace)
    const plansRoot = await realpath(resolve(workspace, config.plansDirectory))

    if (!isInside(workspace, plansRoot)) {
        throw new Error(`plans-directory resolves outside the repository workspace: ${config.plansDirectory}`)
    }

    const plans = await discoverExecPlans(plansRoot, workspace)

    if (plans.length === 0) {
        throw new Error(`No ExecPlans found under ${plansRoot}`)
    }

    resolvePlanStates(plans)
    return plans
}

export async function synchronizePlans(
    config: ExecPlanSyncConfig,
    issueRepository: IssueRepositoryPort,
    projectBoard: ProjectBoardPort,
): Promise<SyncReport> {
    if (config.mode !== 'sync' || !config.project) {
        throw new Error('synchronizePlans requires sync-mode configuration')
    }

    const plans = await loadAndValidatePlans(config)
    const synchronizer = new ExecPlanSynchronizer(issueRepository, projectBoard, {
        blobBaseUrl: blobBaseUrl(config),
        dryRun: config.dryRun,
        generator: config.issueGenerator,
        statuses: config.project.statuses,
        labels: config.labels,
    })

    return synchronizer.sync(plans)
}
