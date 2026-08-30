import type { RawConfigInput } from './config.js'

export type ActionInputReader = (name: string) => string

function optionalInput(reader: ActionInputReader, name: string): string | undefined {
    return reader(name).trim() || undefined
}

export function readActionInputs(reader: ActionInputReader): RawConfigInput {
    return {
        mode: optionalInput(reader, 'mode'),
        dryRun: optionalInput(reader, 'dry-run'),
        workspace: optionalInput(reader, 'workspace'),
        plansDirectory: optionalInput(reader, 'plans-directory'),
        repository: optionalInput(reader, 'repository'),
        sourceRef: optionalInput(reader, 'source-ref'),
        projectOwner: optionalInput(reader, 'project-owner'),
        projectNumber: optionalInput(reader, 'project-number'),
        statusField: optionalInput(reader, 'status-field'),
        backlogStatus: optionalInput(reader, 'backlog-status'),
        todoStatus: optionalInput(reader, 'todo-status'),
        inProgressStatus: optionalInput(reader, 'in-progress-status'),
        doneStatus: optionalInput(reader, 'done-status'),
        issueGenerator: optionalInput(reader, 'issue-generator'),
    }
}
