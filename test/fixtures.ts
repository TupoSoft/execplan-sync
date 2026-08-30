export interface PlanFixtureOptions {
    title?: string
    purpose?: string
    progress?: string
    dependencies?: string
    readiness?: string
}

export function buildPlanFile(options: PlanFixtureOptions = {}): string {
    return [
        `# ${options.title ?? 'Grant credits idempotently'}`,
        '',
        'This ExecPlan is a living document.',
        '',
        '## Purpose / Big Picture',
        '',
        options.purpose ?? 'Make adding credits as safe as spending them.',
        '',
        '## Progress',
        '',
        options.progress ?? '- [ ] One.\n- [ ] Two.',
        '',
        '## Plan dependencies',
        '',
        options.dependencies ?? 'None.',
        '',
        '## Plan readiness',
        '',
        options.readiness ?? 'Ready to implement.',
        '',
    ].join('\n')
}
