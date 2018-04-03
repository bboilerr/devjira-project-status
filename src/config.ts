import * as fs from 'fs';

export interface JiraConfig {
    protocol: string,
    host: string,
    username: string,
    password: string,
    apiVersion?: string,
    strictSSL?: boolean
}

export interface Search {
    name: string,
    jql: string
}

export interface Config {
    jira: JiraConfig,
    searches: Array<Search>
}

export let config: Config = null;
try {
    config = <Config>JSON.parse(fs.readFileSync('src/config.json').toString());
} catch (error) {
    console.error(`Error loading config: ${error}`);
    process.exit();
}