import * as express from 'express'
import * as csv from 'csv'
import * as JiraApi from 'jira-client'
import { Config, Search } from './config'

export default class App {
    private express
    private jira
    private jiraFields = {}
    private jiraFieldsByName = {}

    constructor (private config: Config) {
        this.express = express()
        this.mountRoutes()
        this.config = config
        this.jira = new JiraApi({
            protocol: config.jira.protocol,
            host: config.jira.host,
            username: config.jira.username,
            password: config.jira.password,
            apiVersion: config.jira.apiVersion,
            strictSSL: config.jira.strictSSL
        });
    }

    private mountRoutes (): void {
        const router = express.Router()
        router.get('/', (req, res) => {
            res.json({
                message: 'Hello World!'
            })
        })
        this.express.use('/', router)
    }

    private async getJiraFields() {
        try {
            let fields = await this.jira.listFields()
            let fieldsMap = {byId: {}, byName: {}}
            for (let field of fields) {
                fieldsMap.byId[field.id] = field
                fieldsMap.byName[field.name] = field
            }
            return fieldsMap
        } catch (error) {
            console.error(`Error getting Jira Fields: ${error}`)
            throw error
        }
    }

    private async performJiraSearch(search: Search, startAt: number = 0, maxResults: number = 50) {
        try {
            let search = this.config.search[0]
            console.log(`Performing search: ${search.name}, startAt: ${startAt}, maxResults: ${maxResults}`)
            return await this.jira.searchJira(search.jql, {startAt: startAt, maxResults: maxResults})
        } catch (error) {
            console.error(`Error performing jira search: ${error}`)
            throw error
        }
    }

    private async getJiraSearchResults(search: Search) {
        // TODO: A
    }

    private async doJira() {
        try {
            this.jiraFields = await this.getJiraFields()
        } catch (error) {
            console.error(`Error performing jira tasks: ${error}`)
        }
    }

    public execute() {
        this.doJira();
    }
}
