import * as JiraApi from 'jira-client';
import { Config, Search } from './config';
import * as _ from 'lodash';
import * as moment from 'moment';
import { Sprint, ReportDataIssue, ReportData } from './types';

const ISSUES_PER_SEARCH = 50;

export default class JiraReportDataGenerator {
    private express;
    private jira;
    private jiraFields;
    private jiraIssues;
    private reportData: ReportData;

    constructor (private config: Config, private jiraSearch: Search) {
        this.config = config;
        this.jira = new JiraApi({
            protocol: config.jira.protocol,
            host: config.jira.host,
            username: config.jira.username,
            password: config.jira.password,
            apiVersion: config.jira.apiVersion,
            strictSSL: config.jira.strictSSL
        });
    }

    private async getJiraFields() {
        try {
            let fields = await this.jira.listFields();
            let fieldsMap = {byId: {}, byName: {}};
            for (let field of fields) {
                fieldsMap.byId[field.id] = field;
                fieldsMap.byName[field.name] = field;
            }
            return fieldsMap;
        } catch (error) {
            console.error(`Error getting Jira Fields: ${error}`);
            console.error(error);
            throw error;
        }
    }

    private async performJiraSearch(search: Search, startAt: number = 0, maxResults: number = ISSUES_PER_SEARCH) {
        try {
            let search = this.config.searches[0];
            console.log(`Performing search: ${search.name}, startAt: ${startAt}, maxResults: ${maxResults}`);
            return await this.jira.searchJira(search.jql, {startAt: startAt, maxResults: maxResults});
        } catch (error) {
            console.error(`Error performing jira search: ${error}`);
            console.error(error);
            throw error;
        }
    }

    private async getJiraSearchResults(search: Search) {
        const ISSUES_PER_SEARCH = 50;
        try {
            console.log(`Performing search '${this.jiraSearch.name}': ${this.jiraSearch.jql}`);
            let startAt = 0;
            let searchResults = await this.performJiraSearch(this.jiraSearch, startAt);
            let issuesLeft = searchResults.total - ISSUES_PER_SEARCH;
            let issues = searchResults.issues;
            while (issuesLeft > 0) {
                startAt += ISSUES_PER_SEARCH;
                searchResults = await this.performJiraSearch(this.jiraSearch, startAt);
                issues.push(...searchResults.issues);
                issuesLeft -= ISSUES_PER_SEARCH;
            }
            return issues;
        } catch (error) {
            console.error(`Error getting Jira search results: ${error}`);
            console.error(error);
            throw error;
        }
    }

    private async generateReportData() {
        try {
            const FIELD_ASSIGNEE = this.jiraFields.byName['Assignee'].id;
            const FIELD_ISSUE_TYPE = this.jiraFields.byName['Issue Type'].id;
            const FIELD_STATUS = this.jiraFields.byName['Status'].id;
            const FIELD_SUMMARY = this.jiraFields.byName['Summary'].id;
            const FIELD_SPRINT = this.jiraFields.byName['Sprint'].id;
            const FIELD_EPIC_LINK = this.jiraFields.byName['Epic Link'].id;
            const FIELD_EPIC_NAME = this.jiraFields.byName['Epic Name'].id;
            const FIELD_STORY_POINTS = this.jiraFields.byName['Story Points'].id;
            const FIELD_TIME_SPENT = this.jiraFields.byName['Time Spent'].id;
            const FIELD_CREATED = this.jiraFields.byName['Created'].id;
            let issuesByKey = this.jiraIssues.reduce((map, issue) => {
                map[issue.key] = issue;
                return map;
            }, {}); 
            let reportData = <ReportData>{};
            let reportDataIssuesPromise = this.jiraIssues.map(async issue => {
                let reportDataIssue = <ReportDataIssue>{};
                reportDataIssue.issue = issue.key;
                reportDataIssue.uri = `${this.config.jira.protocol}://${this.config.jira.host}/browse/${issue.key}`;
                reportDataIssue.assignee = ((FIELD_ASSIGNEE in issue.fields) && issue.fields[FIELD_ASSIGNEE] && issue.fields[FIELD_ASSIGNEE].displayName);
                reportDataIssue.issueType = ((FIELD_ISSUE_TYPE in issue.fields) && issue.fields[FIELD_ISSUE_TYPE] && issue.fields[FIELD_ISSUE_TYPE].name);
                reportDataIssue.summary = ((FIELD_SUMMARY in issue.fields) && issue.fields[FIELD_SUMMARY]);
                reportDataIssue.created = ((FIELD_CREATED in issue.fields) && issue.fields[FIELD_CREATED]);
                reportDataIssue.status = ((FIELD_STATUS in issue.fields) && issue.fields[FIELD_STATUS] && issue.fields[FIELD_STATUS].name);
                reportDataIssue.storyPoints = ((FIELD_STORY_POINTS in issue.fields) && issue.fields[FIELD_STORY_POINTS]);
                reportDataIssue.storyPointsRemaining = null;
                if (reportDataIssue.storyPoints) {
                    let timeSpent = ((FIELD_TIME_SPENT in issue.fields) && issue.fields[FIELD_TIME_SPENT]);
                    if (timeSpent) {
                        // Time spent in work days
                        timeSpent /= (60 * 60 * 8);
                        reportDataIssue.storyPointsRemaining = reportDataIssue.storyPoints - timeSpent;
                    } else {
                        reportDataIssue.storyPointsRemaining = reportDataIssue.storyPoints;
                    }
                }
                reportDataIssue.sprint = null;
                if ((FIELD_SPRINT in issue.fields) && issue.fields[FIELD_SPRINT] && issue.fields[FIELD_SPRINT].length) {
                    let latestSprintData = _.last(issue.fields[FIELD_SPRINT]);
                    let sprintDataFields = /[^\[]+\[([^\]]+)\]/.exec(latestSprintData)[1].split(',');
                    let sprint = <Sprint>{};
                    for (let sprintDataField of sprintDataFields) {
                        let data = sprintDataField.split('=');
                        if (data[0] === 'name') {
                            sprint.name = data[1];
                        } else if (data[0] === 'id') {
                            sprint.id = parseInt(data[1]);
                        } else if (data[0] === 'state') {
                            sprint.state = data[1];
                        } else if (data[0] === 'startDate') {
                            sprint.startDate = data[1];
                        } else if (data[0] === 'endDate') {
                            sprint.endDate = moment(data[1]).toISOString();
                        } else if (data[0] === 'completedDate') {
                            sprint.completedDate = moment(data[1]).toISOString();
                        }
                    }

                    // If an issue isn't resolved and its latest sprint is closed, then it's a backlog item (no sprint).
                    if (!(reportDataIssue.status !== 'Resolved' && sprint.state === 'CLOSED')) {
                        reportDataIssue.sprint = sprint;
                    }
                }
                reportDataIssue.epic = null;
                if ((FIELD_EPIC_NAME in issue.fields) && issue.fields[FIELD_EPIC_NAME]) {
                    reportDataIssue.epic = `${issue.key} - ${issue.fields[FIELD_EPIC_NAME]}`;
                } else if ((FIELD_EPIC_LINK in issue.fields) && issue.fields[FIELD_EPIC_LINK]) {
                    let epicKey = issue.fields[FIELD_EPIC_LINK];
                    if (epicKey in issuesByKey) {
                        let epicIssue = issuesByKey[epicKey];
                        reportDataIssue.epic = `${epicIssue.key} - ${epicIssue.fields[FIELD_EPIC_NAME]}`;
                    } else {
                        let epicIssue = await this.jira.findIssue(epicKey);
                        reportDataIssue.epic = `${epicIssue.key} - ${epicIssue.fields[FIELD_EPIC_NAME]}`;
                    }
                }
                return reportDataIssue;
            });
            reportData.reportDataIssues = [];
            let reportDataIssues = await Promise.all(reportDataIssuesPromise);
            for (let reportDataIssue of reportDataIssues) {
                reportData.reportDataIssues.push(<ReportDataIssue>reportDataIssue);
            }
            reportData.reportDataIssues.sort((a, b) => {
                // Sort by sprint, active first
                if (a.sprint || b.sprint) {
                    if (a.sprint && !b.sprint) {
                        return -1;
                    } else if (!a.sprint && b.sprint) {
                        return 1;
                    } else {
                        if (a.sprint.state === 'ACTIVE' && b.sprint.state !== 'ACTIVE') {
                            return -1;
                        } else if (a.sprint.state !== 'ACTIVE' && b.sprint.state === 'ACTIVE') {
                            return 1;
                        } else if (a.sprint.id !== b.sprint.id) {
                            return a.sprint.id - b.sprint.id;
                        }
                    }
                }

                // Sort by assignee
                if (a.assignee || b.assignee) {
                    if (a.assignee && !b.assignee) {
                        return -1;
                    } else if (!a.assignee && b.assignee) {
                        return 1;
                    } else if (a.assignee !== b.assignee) {
                        return a.assignee.localeCompare(b.assignee);
                    }
                }

                // Sort by story points, higher first
                if (a.storyPoints || b.storyPoints) {
                    if (a.storyPoints && !b.storyPoints) {
                        return -1;
                    } else if (!a.storyPoints && b.storyPoints) {
                        return 1
                    } else if (a.storyPoints !== b.storyPoints) {
                        return b.storyPoints - a.storyPoints;
                    }
                }

                return a.issue.localeCompare(b.issue);
            });
            return reportData;
        } catch (error) {
            console.error(`Error generating report data: ${error}`);
            console.error(error);
            throw error;
        }
    }

    public async generate() {
        try {
            this.jiraFields = await this.getJiraFields();
            this.jiraIssues = await this.getJiraSearchResults(this.jiraSearch);
            console.log(`Retrieved ${this.jiraIssues.length} issues`);
            this.reportData = await this.generateReportData();
            return this.reportData;
        } catch (error) {
            console.error(`Error performing jira tasks: ${error}`);
            console.error(error);
            throw error;
        }
    }
}
