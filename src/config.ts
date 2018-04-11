import * as fs from 'fs';

export interface JiraConfig {
    protocol: string,
    host: string,
    username: string,
    password: string,
    apiVersion?: string,
    strictSSL?: boolean
}

export interface SearchMailer {
    fromName: string,
    fromEmail: string,
    to: string
}

export interface SearchScheduler {
    dayOfWeek: Array<number>,
    hour: number,
    minute: number
}

export interface Search {
    name: string,
    jql: string
    mailer?: SearchMailer
    schedulers?: Array<SearchScheduler>
}

export interface Express {
    port: number
}

export interface Config {
    jira: JiraConfig,
    searches: Array<Search>,
    express: Express,
    nodemailer?: any
}

export let config: Config = null;
try {
    config = <Config>JSON.parse(fs.readFileSync('src/config.json').toString());
} catch (error) {
    console.error(`Error loading config: ${error}`);
    process.exit();
}