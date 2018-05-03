import * as minimist from 'minimist';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import { exec } from 'child_process';
import { config, Config, Search } from './config';
import JiraReportDataGenerator from './JiraReportDataGenerator';
import Spreadsheet from './Spreadsheet';
import { ReportData } from './types';
import Mailer from './Mailer';
import Scheduler from './Scheduler';

interface CommandLineArguments {
    _: Array<string>,
    search?: string,
    serve?: boolean
}

class App {
    private express;
    private mailer: Mailer;
    private scheduler: Scheduler;

    constructor(private config: Config) {
        this.express = express();

        this.express.use(bodyParser.json());

        this.express.get('/searches', (req, res) => {
            res.json({searches: this.config.searches.map(search => search.name)});
        });

        this.express.post('/generate', async (req, res) => {
            if (!(req.body && req.body.search && this.config.searches.find(element => element.name === req.body.search))) {
                res.status(404).send(`Search not found.`);
            } else {
                let spreadsheetUrl = await this.generateSpreadsheetForSearch(req.body.search);
                console.log();
                res.json({spreadsheetUrl: spreadsheetUrl});
            }
        });

        this.express.use('/', express.static('static'));
    }

    private usage() {
        console.log(`usage: npm start -- --search <searchName> --serve`);
    }

    private async generateSpreadsheetForSearch(search: string) {
        let jiraSearch: Search = null;
        let spreadsheetUrl: string = null;
        for (let configuredSearch of this.config.searches) {
            if (configuredSearch.name === search) {
                jiraSearch = configuredSearch;
                break;
            }
        }

        if (!jiraSearch) {
            console.error(`Search name "${search}" not found in config.json. Configured searches: ${this.config.searches.map(x => x.name).join(', ')}`);
            this.usage();
        } else {
            let jiraReportDataGenerator = new JiraReportDataGenerator(this.config, jiraSearch);
            let jiraReportData: ReportData = null;
            try {
                jiraReportData = await jiraReportDataGenerator.generate();
            } catch (error) {
                console.error(`Error generating Jira report data: ${error}`);
                console.error(error);
                throw error;
            }

            let title: string = null;
            let spreadsheet: Spreadsheet = null;
            if (jiraReportData) {
                try {
                    spreadsheet = new Spreadsheet(jiraReportData, jiraSearch, config);
                    spreadsheetUrl = await spreadsheet.generate();
                    title = spreadsheet.getTitle();
                } catch (error) {
                    console.error(`Error generating spreadsheet: ${error}`);
                    console.error(error);
                    throw error;
                }
            }

            if (spreadsheetUrl && this.mailer && jiraSearch.mailer) {
                const from = `${jiraSearch.mailer.fromName} <${jiraSearch.mailer.fromEmail}>`;
                const replyTo = `${jiraSearch.mailer.fromName} <${jiraSearch.mailer.fromEmail}>`;
                const subject = title;
                const html = this.mailer.getMailHtml(title, spreadsheetUrl, spreadsheet.sprintStats);
                this.mailer.sendMail(from, replyTo, jiraSearch.mailer.to, subject, undefined, html);
            }
        }

        return spreadsheetUrl;
    }

    public async execute() {
        const args = <CommandLineArguments>minimist(process.argv.slice(2));

        if (!args.search && !args.serve) {
            console.error('Search name nor Serve specified.');
            this.usage();
            process.exit();
        }

        if (!this.config.searches.length) {
            console.error('Must have searches configured in config.json');
            this.usage();
            process.exit();
        }

        if (this.config.nodemailer) {
            this.mailer = new Mailer(this.config.nodemailer);
        }

        this.scheduler = new Scheduler();
        for (let jiraSearch of this.config.searches) {
            if (jiraSearch.schedulers) {
                for (let scheduler of jiraSearch.schedulers) {
                    this.scheduler.schedule(scheduler, async () => {
                        await this.generateSpreadsheetForSearch(jiraSearch.name);
                        console.log();
                    });
                }
            }
        }

        if (args.search) {
            let spreadsheetUrl: string = null;
            try {
                spreadsheetUrl = await this.generateSpreadsheetForSearch(args.search);
            } catch (error) {
                console.error(`Error generating spreadsheet: ${error}`);
                console.error(error);
            }

            if (spreadsheetUrl) {
                exec(`start chrome "${spreadsheetUrl}"`);
            }

            console.log();
        }

        if (args.serve) {
            this.express.listen(3210, () => {
                console.log('Listening on port 3210');
            });
        }
    }
}

let app = new App(config);
app.execute();