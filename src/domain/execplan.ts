import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

export const PLAN_STATES = ['backlog', 'todo', 'inProgress', 'done'] as const

export type PlanState = (typeof PLAN_STATES)[number]
export type ReadinessState = 'ready' | 'conditional' | 'blocked' | 'unknown'

export interface ExecPlanProgress {
    total: number
    completed: number
}

export interface ExecPlanReadiness {
    state: ReadinessState
    text: string
}

export interface ExecPlan {
    /** Stable repository-local identity shaped `<feature>/<NN>`, such as `payments/01`. */
    key: string
    /** Repository-relative path using forward slashes. */
    path: string
    title: string
    purpose: string
    dependencies: string[]
    readiness: ExecPlanReadiness
    progress: ExecPlanProgress
}

export interface ExecPlanState {
    status: PlanState
    detail?: string
}

export interface ExecPlanMarkerAnalysis {
    markers: string[]
    malformedCandidates: string[]
}

export interface RenderIssueBodyOptions {
    blobBaseUrl: string
    generator: string
    statusName: string
}

const CHECKBOX_PATTERN = /^\s*-\s*\[( |x|X)\]/
const FEATURE_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const PLAN_FILE_PATTERN = /^(\d+)-.+\.md$/
const EXECPLAN_MARKER_CANDIDATE_PATTERN = /<!--\s*execplan[\s\S]*?(?:-->|$)/gi
const EXECPLAN_MARKER_PATTERN = /^<!--\s*execplan:\s*([a-z0-9][a-z0-9-]*\/\d+)\s*-->$/

/**
 * Uses the numeric filename prefix as stable identity so changing a slug does not orphan an issue.
 */
export function planKeyFromPath(planPath: string): string | undefined {
    const segments = planPath.replace(/\\/g, '/').split('/')
    const fileName = segments.at(-1)
    const feature = segments.at(-2)

    if (!fileName || !feature) {
        return undefined
    }

    const numericPrefix = PLAN_FILE_PATTERN.exec(fileName)

    return numericPrefix && FEATURE_PATTERN.test(feature) ? `${feature}/${numericPrefix[1]}` : undefined
}

function sectionBody(lines: string[], headingIndex: number): string {
    const rest = lines.slice(headingIndex + 1)
    const end = rest.findIndex((line) => line.startsWith('## '))

    return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

function readSection(contents: string, heading: string): string {
    const lines = contents.split('\n')
    const start = lines.findIndex((line) => line.trim() === `## ${heading}`)

    return start === -1 ? '' : sectionBody(lines, start)
}

type RequiredSectionLookup =
    { kind: 'exact'; text: string } | { kind: 'near-match'; foundHeading: string } | { kind: 'absent' }

type ResolvedSection = { kind: 'exact'; text: string } | { kind: 'absent' }

function findRequiredSection(contents: string, heading: string): RequiredSectionLookup {
    const lines = contents.split('\n')
    const canonical = `## ${heading}`
    const exactIndex = lines.findIndex((line) => line.trim() === canonical)

    if (exactIndex !== -1) {
        return { kind: 'exact', text: sectionBody(lines, exactIndex) }
    }

    const nearIndex = lines.findIndex((line) => line.trim().toLowerCase() === canonical.toLowerCase())

    return nearIndex === -1 ? { kind: 'absent' } : { kind: 'near-match', foundHeading: lines[nearIndex]!.trim() }
}

function requireCanonicalHeading(
    lookup: RequiredSectionLookup,
    planPath: string,
    heading: string,
): asserts lookup is ResolvedSection {
    if (lookup.kind === 'near-match') {
        throw new Error(
            `${planPath} has a malformed heading "${lookup.foundHeading}"; expected exactly "## ${heading}"`,
        )
    }
}

function classifyReadiness(text: string): ReadinessState {
    if (/^Ready to implement\.?$/.test(text)) {
        return 'ready'
    }

    if (text.startsWith('Ready after')) {
        return 'conditional'
    }

    if (text.startsWith('Blocked by')) {
        return 'blocked'
    }

    return 'unknown'
}

function readProgress(contents: string): ExecPlanProgress {
    const checkboxes = readSection(contents, 'Progress')
        .split('\n')
        .map((line) => CHECKBOX_PATTERN.exec(line))
        .filter((match): match is RegExpExecArray => match !== null)

    return {
        total: checkboxes.length,
        completed: checkboxes.filter((match) => match[1]!.toLowerCase() === 'x').length,
    }
}

function readDependencies(contents: string, planPath: string, progress: ExecPlanProgress): string[] {
    const lookup = findRequiredSection(contents, 'Plan dependencies')
    requireCanonicalHeading(lookup, planPath, 'Plan dependencies')

    if (lookup.kind === 'absent') {
        const isFullyComplete = progress.total > 0 && progress.completed === progress.total

        if (!isFullyComplete) {
            throw new Error(
                `${planPath} is missing a "## Plan dependencies" section; only a fully completed legacy plan may omit it`,
            )
        }

        return []
    }

    if (!lookup.text || lookup.text === 'None.') {
        return []
    }

    const dependencies = lookup.text.split('\n').map((line) => {
        const key = /^\s*-\s+`([a-z0-9][a-z0-9-]*\/\d+)`\s*$/.exec(line)?.[1]

        if (!key) {
            throw new Error(`${planPath} has an invalid Plan dependencies entry: ${line}`)
        }

        return key
    })

    const duplicate = dependencies.find((key, index) => dependencies.indexOf(key) !== index)

    if (duplicate) {
        throw new Error(`${planPath} declares dependency ${duplicate} more than once`)
    }

    return dependencies
}

function readRequiredReadiness(contents: string, planPath: string): string {
    const lookup = findRequiredSection(contents, 'Plan readiness')
    requireCanonicalHeading(lookup, planPath, 'Plan readiness')

    if (lookup.kind === 'absent' || lookup.text === '') {
        throw new Error(`${planPath} is missing a nonempty "## Plan readiness" section`)
    }

    return lookup.text
}

export function parseExecPlan(planPath: string, contents: string): ExecPlan {
    const key = planKeyFromPath(planPath)

    if (!key) {
        throw new Error(`${planPath} is not an ExecPlan: expected a NN-<slug>.md file inside a feature directory`)
    }

    const title = /^#\s+(.+)$/m.exec(contents)?.[1]?.trim()

    if (!title) {
        throw new Error(`${planPath} has no level-one heading to use as an issue title`)
    }

    const progress = readProgress(contents)
    const readinessText = readRequiredReadiness(contents, planPath)

    return {
        key,
        path: planPath.replace(/\\/g, '/'),
        title,
        purpose: readSection(contents, 'Purpose / Big Picture'),
        dependencies: readDependencies(contents, planPath, progress),
        readiness: { state: classifyReadiness(readinessText), text: readinessText },
        progress,
    }
}

export function execPlanMarker(key: string): string {
    return `<!-- execplan: ${key} -->`
}

/**
 * Finds every comment that starts like an ExecPlan marker, including malformed variants.
 * Callers must fail closed when malformedCandidates is nonempty so a typo cannot hide an
 * existing issue and cause a duplicate to be created.
 */
export function analyzeExecPlanMarkers(body: string): ExecPlanMarkerAnalysis {
    const markers: string[] = []
    const malformedCandidates: string[] = []

    for (const candidateMatch of body.matchAll(EXECPLAN_MARKER_CANDIDATE_PATTERN)) {
        const candidate = candidateMatch[0]
        const canonical = EXECPLAN_MARKER_PATTERN.exec(candidate)

        if (canonical) {
            markers.push(canonical[1]!)
        } else {
            malformedCandidates.push(candidate)
        }
    }

    return { markers, malformedCandidates }
}

export function extractExecPlanMarkers(body: string): string[] {
    return analyzeExecPlanMarkers(body).markers
}

export function isBlockedPlan(plan: ExecPlan): boolean {
    return plan.readiness.state === 'conditional' || plan.readiness.state === 'blocked'
}

function terminalProgressStatus(plan: ExecPlan): PlanState | undefined {
    const { total, completed } = plan.progress

    if (total > 0 && completed === total) {
        return 'done'
    }

    return completed > 0 ? 'inProgress' : undefined
}

function validateDependencyGraph(plans: ExecPlan[]): Map<string, ExecPlan> {
    const byKey = new Map<string, ExecPlan>()

    for (const plan of plans) {
        if (byKey.has(plan.key)) {
            throw new Error(`Duplicate ExecPlan key ${plan.key}`)
        }

        byKey.set(plan.key, plan)
    }

    for (const plan of plans) {
        for (const dependency of plan.dependencies) {
            if (dependency === plan.key) {
                throw new Error(`${plan.key} cannot depend on itself`)
            }

            if (!byKey.has(dependency)) {
                throw new Error(`${plan.key} depends on missing ExecPlan ${dependency}`)
            }
        }
    }

    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (key: string, path: string[]): void => {
        if (visiting.has(key)) {
            const cycleStart = path.indexOf(key)
            throw new Error(`ExecPlan dependency cycle: ${[...path.slice(cycleStart), key].join(' -> ')}`)
        }

        if (visited.has(key)) {
            return
        }

        visiting.add(key)
        const nextPath = [...path, key]

        for (const dependency of byKey.get(key)?.dependencies ?? []) {
            visit(dependency, nextPath)
        }

        visiting.delete(key)
        visited.add(key)
    }

    for (const plan of plans) {
        visit(plan.key, [])
    }

    return byKey
}

/** Resolves the complete graph so dependency state comes only from checked-in plans. */
export function resolvePlanStates(plans: ExecPlan[]): Map<string, ExecPlanState> {
    const byKey = validateDependencyGraph(plans)
    const states = new Map<string, ExecPlanState>()

    for (const plan of plans) {
        const terminalStatus = terminalProgressStatus(plan)

        if (terminalStatus) {
            states.set(plan.key, { status: terminalStatus })
            continue
        }

        if (plan.readiness.state !== 'ready') {
            const detail =
                plan.readiness.state === 'conditional'
                    ? `Decision required: ${plan.readiness.text}`
                    : plan.readiness.state === 'blocked'
                      ? plan.readiness.text
                      : 'Readiness is not stated in a recognized form.'
            states.set(plan.key, { status: 'backlog', detail })
            continue
        }

        const incompleteDependencies = plan.dependencies.filter((dependency) => {
            const dependencyPlan = byKey.get(dependency)
            return !dependencyPlan || terminalProgressStatus(dependencyPlan) !== 'done'
        })

        states.set(
            plan.key,
            incompleteDependencies.length > 0
                ? {
                      status: 'backlog',
                      detail: `Waiting for ${incompleteDependencies.map((key) => `\`${key}\``).join(', ')}.`,
                  }
                : { status: 'todo' },
        )
    }

    return states
}

export function renderIssueBody(plan: ExecPlan, state: ExecPlanState, options: RenderIssueBodyOptions): string {
    const link = `${options.blobBaseUrl.replace(/\/$/, '')}/${plan.path}`
    const { completed, total } = plan.progress
    const dependencies =
        plan.dependencies.length > 0 ? `${plan.dependencies.map((key) => `\`${key}\``).join(', ')}.` : 'None.'
    const effectiveStatus = state.detail ? `${options.statusName} — ${state.detail}` : options.statusName

    return [
        execPlanMarker(plan.key),
        `Generated from [\`${plan.path}\`](${link}) by \`${options.generator}\`. Edits to this description are`,
        'overwritten on the next sync; use comments for discussion.',
        '',
        '## Purpose',
        '',
        plan.purpose,
        '',
        '## Plan state',
        '',
        `- Readiness: ${plan.readiness.text || 'not stated'}`,
        `- Dependencies: ${dependencies}`,
        `- Progress: ${completed} of ${total} tasks complete.`,
        `- Effective status: ${effectiveStatus}`,
        '',
    ].join('\n')
}

/** Discovers direct feature-directory plan files and returns them in stable key order. */
export async function discoverExecPlans(plansRoot: string, repositoryRoot: string): Promise<ExecPlan[]> {
    const features = await readdir(plansRoot, { withFileTypes: true })
    const plans: ExecPlan[] = []

    for (const feature of features.filter((entry) => entry.isDirectory())) {
        const featureDir = join(plansRoot, feature.name)

        for (const entry of await readdir(featureDir, { withFileTypes: true })) {
            const planPath = join(featureDir, entry.name)
            const repositoryRelativePath = relative(repositoryRoot, planPath).replace(/\\/g, '/')

            if (!entry.isFile() || !PLAN_FILE_PATTERN.test(entry.name)) {
                continue
            }

            if (!FEATURE_PATTERN.test(feature.name)) {
                throw new Error(
                    `${repositoryRelativePath} uses invalid feature directory "${feature.name}"; expected lowercase letters, digits, and hyphens`,
                )
            }

            plans.push(parseExecPlan(repositoryRelativePath, await readFile(planPath, 'utf8')))
        }
    }

    return plans.sort((left, right) => left.key.localeCompare(right.key))
}
