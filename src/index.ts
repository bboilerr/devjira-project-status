import * as minimist from 'minimist'
import { config } from './config'

interface CommandLineArguments {
    _: Array<string>,
    search?: string
}

function usage() {
    console.log(`usage: npm start -- --search <searchName>`)
}

const args = <CommandLineArguments>minimist(process.argv.slice(2))

if (!args.search) {
    console.error('Search name not specified.')
    usage()
    process.exit()
}

if (!config.searches.length) {
    console.error('Must have searches configured in config.json')
    usage()
    process.exit()
}

let jiraSearch = null
for (let configuredSearch of config.searches) {
    if (configuredSearch.name === args.search) {
        jiraSearch = configuredSearch
        break
    }
}

if (!jiraSearch) {
    console.error(`Search name "${args.search}" not found in config.json. Configured searches: ${config.searches.map(x => x.name).join(', ')}`)
    usage()
    process.exit()
}

import App from './App'
let app = new App(config)
app.execute()