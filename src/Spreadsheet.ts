import * as fs from 'fs';
import * as readline from 'readline';
import * as moment from 'moment-timezone';
import { Sprint, ReportDataIssue, ReportData } from './types';
import { Search } from './config';
import { google } from 'googleapis';
const OAuth2Client = google.auth.OAuth2;
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'src/credentials.json';
import { exec } from 'child_process';
import { POINT_CONVERSION_COMPRESSED } from 'constants';
import { resolve } from 'url';

interface SprintIssues {
    sprint: string,
    sprintData: Sprint,
    issues: Array<ReportDataIssue>,
    dataHeaderStartRow: number
}

export default class Spreadsheet {
    private clientSecret;

    constructor(private reportData: ReportData, private jiraSearch: Search) {
        try {
            this.clientSecret = JSON.parse(fs.readFileSync('src/client-secret.json').toString());
        } catch (error) {
            console.error(`Error loading Google client secret: ${error}`);
            console.error(error);
        }
    }

    /**
     * Get and store new token after prompting for user authorization.
     * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
     */
    private getNewToken(oAuth2Client) {
        return new Promise((resolve, reject) => {
            const authUrl = oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES,
            });
            console.log('Authorize this app by visiting this url (or follow directions in the chrome window that opens):', authUrl);
            exec(`start chrome "${authUrl}"`);
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question('Enter the code from that page here: ', (code) => {
                rl.close();
                oAuth2Client.getToken(code, (err, token) => {
                    if (err) {
                        console.error(`Error getting token: ${err}`);
                        console.error(err);
                        reject(err);
                    } else {
                        oAuth2Client.setCredentials(token);
                        // Store the token to disk for later program executions
                        fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                            if (err) {
                                console.error(`Error writing token: ${err}`);
                                console.error(err);
                                reject(err);
                            } else {
                                console.log('Token stored to', TOKEN_PATH);
                            }
                        });
                        resolve(oAuth2Client);
                    }
                });
            });
        });
    }

    /**
     * Create an OAuth2 client with the given credentials.
     * @param {Object} credentials The authorization client credentials.
     */
    private authorize(credentials) {
        return new Promise((resolve, reject) => {
            const { client_secret, client_id, redirect_uris } = credentials.installed;
            const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

            // Check if we have previously stored a token.
            let token = null;
            try {
                token = JSON.parse(fs.readFileSync(TOKEN_PATH).toString());
            } catch (error) {
                return this.getNewToken(oAuth2Client);
            }

            if (token) {
                oAuth2Client.setCredentials(token);
                resolve(oAuth2Client);
            }
        });
    }

    private processReportData(reportData: ReportData): Array<SprintIssues> {
        let sprintsMap = new Map();
        for (let issue of this.reportData.reportDataIssues) {
            let sprintIssues = <SprintIssues> {};
            let sprint = (issue.sprint && issue.sprint.name) || 'Backlog';

            if (!sprintsMap.has(sprint)) {
                sprintIssues.sprint = sprint;
                sprintIssues.sprintData = issue.sprint;
                sprintIssues.issues = <Array<ReportDataIssue>> [];
                sprintsMap.set(sprint, sprintIssues);
            } else {
                sprintIssues = sprintsMap.get(sprint);
            }

            sprintIssues.issues.push(issue);
        }
        let sprints = Array.from(sprintsMap.values());
        sprints.sort((a: SprintIssues, b: SprintIssues) => {
            if (a.sprintData && !b.sprintData) {
                return -1;
            } else if (!a.sprintData && b.sprintData) {
                return 1;
            } else if (a.sprintData && b.sprintData) {
                if (a.sprintData.state === 'ACTIVE' && b.sprintData.state !== 'ACTIVE') {
                    return -1;
                } else if (a.sprintData.state !== 'ACTIVE' && b.sprintData.state === 'ACTIVE') {
                    return 1;
                } else if (a.sprint != b.sprint) {
                    return b.sprintData.id - a.sprintData.id;
                }
            }

            return a.sprint.localeCompare(b.sprint);
        });
        return sprints;
    }

    private generateSpreadsheetPromise(auth) {
        return new Promise((resolve, reject) => {
            let title = `${this.jiraSearch.name} - Project Status - ${moment().format('MM/DD/YYYY hh:mm:ss A')}`;
            console.log(`Generating spreadsheet: ${title}`);
            let sprints = this.processReportData(this.reportData);
            let sheetsToAdd = [];
            for (let sprint of sprints) {
                let sheet = {
                    properties: {
                        title: sprint.sprint,
                    },
                    data: []
                };

                // resolved story points
                let resolvedStoryPoints = sprint.issues.reduce((val, issue) => {
                    if (issue.status === 'Resolved' && issue.storyPoints) {
                        val += issue.storyPoints;
                    }
                    return val;
                }, 0);
                // unresolved story points
                let unresolvedStoryPoints = sprint.issues.reduce((val, issue) => {
                    if (issue.status !== 'Resolved' && issue.storyPoints) {
                        val += issue.storyPoints;
                    }
                    return val;
                }, 0);
                // unresolved story points remaining
                let unresolvedStoryPointsRemaining = sprint.issues.reduce((val, issue) => {
                    if (issue.status !== 'Resolved' && issue.storyPointsRemaining) {
                        val += issue.storyPointsRemaining;
                    }
                    return val;
                }, 0);
                // user story points
                let userStoryPoints = sprint.issues.reduce((users, issue) => {
                    if (!(issue.assignee in users)) {
                        users[issue.assignee] = {
                            resolvedStoryPoints: 0,
                            unresolvedStoryPoints: 0,
                            unresolvedStoryPointsRemaining: 0
                        };
                    }

                    if (issue.storyPoints) {
                        if (issue.status === 'Resolved') {
                            users[issue.assignee].resolvedStoryPoints += issue.storyPoints;
                        } else {
                            users[issue.assignee].unresolvedStoryPoints += issue.storyPoints;
                        }
                    }
                    if (issue.storyPointsRemaining && issue.status !== 'Resolved') {
                        users[issue.assignee].unresolvedStoryPointsRemaining += issue.storyPointsRemaining;
                    }
                    return users;
                }, {});

                let statRowData = [
                    {
                        values: [
                            { userEnteredValue: { stringValue: 'Sprint' } },
                            { userEnteredValue: { stringValue: sprint.sprint } },
                        ]
                    },
                    {
                        values: [
                            { userEnteredValue: { stringValue: 'Resolved Story Points' } },
                            { userEnteredValue: { numberValue: resolvedStoryPoints } },
                        ]
                    },
                    {
                        values: [
                            { userEnteredValue: { stringValue: 'Unesolved Story Points' } },
                            { userEnteredValue: { numberValue: unresolvedStoryPoints } },
                        ]
                    },
                    {
                        values: [
                            { userEnteredValue: { stringValue: 'Unesolved Story Points Remaining' } },
                            { userEnteredValue: { numberValue: unresolvedStoryPointsRemaining } },
                        ]
                    },
                ];

                for (let user in userStoryPoints) {
                    statRowData.push({
                        values: [
                            { userEnteredValue: { stringValue: `${user} - Resolved Story Points` } },
                            { userEnteredValue: { numberValue: userStoryPoints[user].resolvedStoryPoints } },
                        ]
                    });
                    statRowData.push({
                        values: [
                            { userEnteredValue: { stringValue: `${user} - Unresolved Story Points` } },
                            { userEnteredValue: { numberValue: userStoryPoints[user].unresolvedStoryPoints } },
                        ]
                    });
                    statRowData.push({
                        values: [
                            { userEnteredValue: { stringValue: `${user} - Unresolved Story Points Remaining` } },
                            { userEnteredValue: { numberValue: userStoryPoints[user].unresolvedStoryPointsRemaining } },
                        ]
                    });
                }

                sprint.dataHeaderStartRow = statRowData.length + 1;

                sheet.data.push({
                    startRow: 0,
                    startColumn: 0,
                    rowData: statRowData
                })

                sheet.data.push({
                    startRow: sprint.dataHeaderStartRow,
                    startColumn: 0,
                    rowData: [{
                        values: [
                            { userEnteredValue: { stringValue: 'Epic' } },
                            { userEnteredValue: { stringValue: 'Type' } },
                            { userEnteredValue: { stringValue: 'Assignee' } },
                            { userEnteredValue: { stringValue: 'Issue' } },
                            { userEnteredValue: { stringValue: 'URI' } },
                            { userEnteredValue: { stringValue: 'Status' } },
                            { userEnteredValue: { stringValue: 'Story Points' } },
                            { userEnteredValue: { stringValue: 'Story Points Remaining' } },
                            { userEnteredValue: { stringValue: 'Summary' } }
                        ]
                    }]
                });

                sheet.data.push({
                    startRow: sprint.dataHeaderStartRow + 1,
                    startColumn: 0,
                    rowData: sprint.issues.map(issue => {
                        return {
                            values: [
                                { userEnteredValue: { stringValue: issue.epic } },
                                { userEnteredValue: { stringValue: issue.issueType } },
                                { userEnteredValue: { stringValue: issue.assignee } },
                                { userEnteredValue: { stringValue: issue.issue } },
                                { userEnteredValue: { stringValue: issue.uri } },
                                { userEnteredValue: { stringValue: issue.status } },
                                { userEnteredValue: { numberValue: issue.storyPoints } },
                                { userEnteredValue: { numberValue: issue.storyPointsRemaining } },
                                { userEnteredValue: { stringValue: issue.summary } }
                            ]
                        }
                    })
                });

                sheetsToAdd.push(sheet);
            }

            const sheets = google.sheets({ version: 'v4', auth });
            sheets.spreadsheets.create({
                resource: {
                    properties: {
                        title: title,
                        locale: 'en_US',
                        timeZone: moment.tz.guess()
                    },
                    sheets: sheetsToAdd
                }
            }, (error, response) => {
                if (error) {
                    console.error(`Error creating spreadsheet: ${error}`);
                    console.error(error);
                    reject(error);
                } else {
                    let spreadsheetId = response.data.spreadsheetId;
                    let spreadsheetUrl = response.data.spreadsheetUrl;

                    let sheetIds = response.data.sheets.map(sheet => {
                        return sheet.properties.sheetId;
                    });

                    let requests = [];

                    let headerBorders = {
                        bottom: {
                            color: {
                                blue: 255,
                                green: 255,
                                red: 255
                            },
                            style: 'SOLID',
                            width: 1
                        },
                        top: {
                            color: {
                                blue: 255,
                                green: 255,
                                red: 255
                            },
                            style: 'SOLID',
                            width: 1
                        },
                        left: {
                            color: {
                                blue: 255,
                                green: 255,
                                red: 255
                            },
                            style: 'SOLID',
                            width: 1
                        },
                        right: {
                            color: {
                                blue: 255,
                                green: 255,
                                red: 255
                            },
                            style: 'SOLID',
                            width: 1
                        },
                    };

                    let headerRowCellFormat = {
                        userEnteredFormat: {
                            textFormat: {
                                bold: true
                            },
                            horizontalAlignment: 'CENTER',
                            borders: headerBorders
                        }
                    };

                    let headerColumnCellFormat = {
                        userEnteredFormat: {
                            textFormat: {
                                bold: true
                            },
                            horizontalAlignment: 'LEFT',
                            borders: headerBorders
                        }
                    };

                    let index = 0;
                    for (let sheetId of sheetIds) {
                        requests.push({
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: sprints[index].dataHeaderStartRow - 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: 1
                                },
                                cell: headerColumnCellFormat,
                                fields: 'userEnteredFormat(borders,textFormat,horizontalAlignment)'
                            }
                        });

                        requests.push({
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: sprints[index].dataHeaderStartRow,
                                    endRowIndex: sprints[index].dataHeaderStartRow + 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: 9
                                },
                                cell: headerRowCellFormat,
                                fields: 'userEnteredFormat(borders,textFormat,horizontalAlignment)'
                            }
                        });

                        requests.push({
                            autoResizeDimensions: {
                                dimensions: {
                                    sheetId: sheetId,
                                    dimension: 'COLUMNS',
                                    startIndex: 0
                                }
                            }
                        });
                        index++;
                    }

                    sheets.spreadsheets.batchUpdate({
                        spreadsheetId: spreadsheetId,
                        resource: {
                            requests: requests
                        }
                    }, (error, response) => {
                        if (error) {
                            console.error(`Error updating spreadsheet: ${error}`);
                            console.error(error);
                            reject(error);
                        } else {
                            resolve(spreadsheetUrl);
                        }
                    });
                }
            });
        });
    }

    private async generateSpreadsheet(auth) {
        let spreadsheetUrl: string = null; 
        try {
            spreadsheetUrl = <string> await this.generateSpreadsheetPromise(auth);
        } catch(error) {
            console.error(`Error generating spreadsheet: ${error}`);
            console.error(error);
            throw error;
        }
        return spreadsheetUrl;
    }

    public async generate() {
        let spreadsheetUrl: string = null;
        if (!this.clientSecret) {
            throw new Error('Client secret not found');
        }

        let auth = null;
        try {
            auth = await this.authorize(this.clientSecret);
        } catch (error) {
            console.error(`Error authorizing Google API client: ${error}`);
            console.error(error);
            throw error;
        }

        if (auth) {
            try {
                spreadsheetUrl = await this.generateSpreadsheet(auth);
            } catch(error) {
                console.error(`Error generating spreadsheet: ${error}`);
                console.error(error);
                throw error;
            }
        }

        return spreadsheetUrl;
    }
}