import * as minimist from 'minimist';
import { config, Config, Search } from './config';
import JiraReportDataGenerator from './JiraReportDataGenerator';
import Spreadsheet from './Spreadsheet';
import { ReportData } from './types';

interface CommandLineArguments {
    _: Array<string>,
    search?: string
}

class App {
    private jiraReportDataGenerator: JiraReportDataGenerator;
    private jiraSearch: Search;
    private jiraReportData: ReportData;
    private spreadsheet: Spreadsheet;

    constructor(private config: Config) {
    }

    private usage() {
        console.log(`usage: npm start -- --search <searchName>`);
    }

    public async execute() {
        const args = <CommandLineArguments>minimist(process.argv.slice(2));

        if (!args.search) {
            console.error('Search name not specified.');
            this.usage();
            process.exit();
        }

        if (!this.config.searches.length) {
            console.error('Must have searches configured in config.json');
            this.usage();
            process.exit();
        }

        for (let configuredSearch of this.config.searches) {
            if (configuredSearch.name === args.search) {
                this.jiraSearch = configuredSearch;
                break;
            }
        }

        if (!this.jiraSearch) {
            console.error(`Search name "${args.search}" not found in config.json. Configured searches: ${this.config.searches.map(x => x.name).join(', ')}`);
            this.usage();
            process.exit();
        }

        this.jiraReportDataGenerator = new JiraReportDataGenerator(this.config, this.jiraSearch);

        try {
            this.jiraReportData = await this.jiraReportDataGenerator.generate();
        } catch (error) {
            console.error(`Error generating Jira report data: ${error}`);
            console.error(error);
            process.exit();
        }
        
        try {
            this.spreadsheet = new Spreadsheet(this.jiraReportData, this.jiraSearch);
            await this.spreadsheet.generate();
        } catch (error) {
            console.error(`Error generating spreadsheet: ${error}`);
            console.error(error);
        }
    }
}

let app = new App(config);
app.execute();