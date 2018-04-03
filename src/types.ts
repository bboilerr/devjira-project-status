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
    storyPointsRemaining: number
}

export interface ReportData {
    reportDataIssues: Array<ReportDataIssue>,
}