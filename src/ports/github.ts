import type { LabelConfig } from '../config.js'

export interface IssueSummary {
    number: number
    url: string
    title: string
    body: string
    assignees: string[]
    labels: string[]
}

export interface IssueContent {
    title: string
    body: string
    labels: string[]
}

export interface IssueUpdate {
    title: string
    body: string
    labelsToAdd: string[]
    labelsToRemove: string[]
}

export interface ProjectItemSummary {
    id: string
    contentUrl?: string
    status?: string
}

export interface IssueRepositoryPort {
    ensureLabels(labels: LabelConfig[]): Promise<void>
    listExecPlanIssues(execplanLabel: string): Promise<IssueSummary[]>
    createIssue(content: IssueContent): Promise<IssueSummary>
    updateIssue(issueNumber: number, update: IssueUpdate): Promise<void>
}

export interface ProjectBoardPort {
    validateStatusOptions(statuses: string[]): Promise<void>
    listProjectItems(): Promise<ProjectItemSummary[]>
    addIssueToProject(issueNumber: number): Promise<string>
    setItemStatus(itemId: string, status: string): Promise<void>
}
