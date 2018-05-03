export interface Sprint {
    id: number,
    name: string,
    state: string,
    startDate: string,
    endDate: string,
    completedDate: string
}

export interface ReportDataIssue {
    issue: string,
    uri: string,
    assignee: string,
    issueType: string,
    status: string,
    summary: string,
    sprint: Sprint,
    epic: string,
    created: string,
    storyPoints: number,
    originalEstimate: number,
    remainingEstimate: number,
    estimatedDaysRemaining: number,
    moscow: string
}

export interface ReportData {
    reportDataIssues: Array<ReportDataIssue>,
}

export interface SprintStat {
    resolvedStoryPoints: number;
    unresolvedStoryPoints: number,
    unresolvedEstimatedDaysRemaining: number;
    moscowStoryPoints: Array<any>;
    userStoryPoints: any;
}

export interface SprintStats {
    sprint: string;
    stat: SprintStat;
}