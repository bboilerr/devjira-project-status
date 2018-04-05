import * as minimist from 'minimist';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import { exec } from 'child_process';
import { config, Config, Search } from './config';
import JiraReportDataGenerator from './JiraReportDataGenerator';
import Spreadsheet from './Spreadsheet';
import { ReportData } from './types';

interface CommandLineArguments {
    _: Array<string>,
    search?: string,
    serve?: boolean
}

class App {
    private express;

    constructor(private config: Config) {
        this.express = express();

        this.express.use(bodyParser.json());

        this.express.get('/searches', (req, res) => {
            res.json({searches: this.config.searches.map(search => search.name)});
        });

        this.express.post('/generate', async (req, res) => {
            console.log(JSON.stringify(req.body, null, 4));
            if (!(req.body && req.body.search && this.config.searches.find(element => element.name === req.body.search))) {
                res.status(404).send(`Search not found.`);
            } else {
                let spreadsheetUrl = await this.generateSpreadsheetForSearch(req.body.search);
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
            }

            if (jiraReportData) {
                try {
                    let spreadsheet = new Spreadsheet(jiraReportData, jiraSearch);
                    spreadsheetUrl = await spreadsheet.generate();
                } catch (error) {
                    console.error(`Error generating spreadsheet: ${error}`);
                    console.error(error);
                }
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

        if (args.search) {
            let spreadsheetUrl = await this.generateSpreadsheetForSearch(args.search);
            exec(`start chrome "${spreadsheetUrl}"`);
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